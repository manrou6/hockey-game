import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { createBall, stepBall, type BallEvent } from '../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createPlayer } from '../../src/sim/player';
import {
  assistParams,
  choosePassTarget,
  groundPassSpeed,
  loftPassSpeed,
  passErrorSd,
  updatePassButton,
  type AssistParams,
} from '../../src/sim/pass';
import { createRng } from '../../src/sim/rng';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

const DT = 1 / 60;

function tuningWith(patch: (t: Tuning) => void): Tuning {
  const t = structuredClone(TUNING);
  patch(t);
  return t;
}

/** No random error: to check the assist geometry exactly. */
const exact = (t: Tuning): void => {
  t.pass.errorBase = t.pass.errorSprint = t.pass.errorPressure = t.pass.errorOffBalance = 0;
  t.pass.errorPower = 0;
};

function cmd(moveX = 0, moveY = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand {
  return { ...emptyCommand(), moveX, moveY, ...extra };
}

function step(w: WorldState, c: PlayerCommand, tuning: Tuning, ticks = 1): void {
  for (let i = 0; i < ticks; i++) stepWorld(w, [c], tuning);
}

function takeBall(w: WorldState, tuning: Tuning): void {
  for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(w, cmd(0.5, 0), tuning);
  step(w, cmd(), tuning, 60);
  expect(w.ball.owner).toBe(0);
}

function runUntil(w: WorldState, c: PlayerCommand, tuning: Tuning, done: () => boolean, maxTicks = 600): number {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return i;
    step(w, c, tuning);
  }
  return -1;
}

/** Aim from the ball at player `to`, offset by `off` rad. */
function aimAt(w: WorldState, to: number, off = 0): PlayerCommand {
  const t = w.players[to]!;
  const a = Math.atan2(t.y - w.ball.y, t.x - w.ball.x) + off;
  return cmd(Math.cos(a), Math.sin(a));
}

/** Tap PASE (press and release in one tick) while aiming. */
function tap(w: WorldState, aim: PlayerCommand, tuning: Tuning): void {
  step(w, { ...aim, pass: true, passHeld: false }, tuning);
}

/** Hold PASE for `seconds`, then release, while aiming. */
function hold(w: WorldState, aim: PlayerCommand, seconds: number, tuning: Tuning): void {
  step(w, { ...aim, pass: true, passHeld: true }, tuning);
  step(w, { ...aim, passHeld: true }, tuning, Math.round(seconds / DT) - 1);
  step(w, aim, tuning);
}

describe('PASE button: tap = ground, hold = lofted (released = it leaves)', () => {
  it('a tap queues a ground pass; holding past tapTime queues a lofted one with its charge', () => {
    const p = createPlayer(0, 0, 0);
    const k = TUNING.pass;
    updatePassButton(p, cmd(0, 0, { pass: true, passHeld: false }), TUNING, DT);
    expect(p.bufPass).toBeGreaterThan(0);
    expect(p.passLoft).toBe(false);

    const q = createPlayer(1, 0, 0);
    updatePassButton(q, cmd(0, 0, { pass: true, passHeld: true }), TUNING, DT);
    expect(q.passHold).toBe(0);
    expect(q.bufPass).toBe(0); // nothing leaves while it's held
    const ticks = Math.round((k.tapTime + k.loftChargeTime / 2) / DT);
    for (let i = 0; i < ticks; i++) updatePassButton(q, cmd(0, 0, { passHeld: true }), TUNING, DT);
    expect(q.bufPass).toBe(0);
    updatePassButton(q, cmd(), TUNING, DT);
    expect(q.passLoft).toBe(true);
    expect(q.passCharge).toBeCloseTo(0.5, 1);
    expect(q.passHold).toBe(-1);
  });

  it('just under tapTime is still a ground pass', () => {
    const p = createPlayer(0, 0, 0);
    updatePassButton(p, cmd(0, 0, { pass: true, passHeld: true }), TUNING, DT);
    for (let i = 0; i < Math.floor(TUNING.pass.tapTime / DT) - 2; i++) updatePassButton(p, cmd(0, 0, { passHeld: true }), TUNING, DT);
    updatePassButton(p, cmd(), TUNING, DT);
    expect(p.passLoft).toBe(false);
  });
});

describe('who the pass goes to (assist cone)', () => {
  const players = [createPlayer(0, 0, 0), createPlayer(1, 10, 2), createPlayer(2, 8, -6), createPlayer(3, 5, 0)];
  players[3]!.team = 1;
  it('the teammate closest to the aimed direction inside the cone; never an opponent', () => {
    expect(choosePassTarget(players, 0, 0, 0.44)).toBe(1); // 11° off vs 37° off
    expect(choosePassTarget(players, 0, -0.64, 0.44)).toBe(2);
    expect(choosePassTarget(players, 0, Math.PI, 0.44)).toBe(-1); // nobody behind
    expect(choosePassTarget(players, 0, 0, 0)).toBe(-1); // assist off
  });

  it('levels: off has no cone, strong has a wider cone and full correction', () => {
    const a: AssistParams = { cone: 0, correction: 0 };
    expect(assistParams('off', TUNING, a).cone).toBe(0);
    expect(assistParams('light', TUNING, a).correction).toBeCloseTo(0.7);
    expect(assistParams('strong', TUNING, a).cone).toBeGreaterThan(TUNING.assist.lightCone);
    expect(assistParams('strong', TUNING, a).correction).toBe(1);
  });
});

describe('automatic strength (matches the real ball physics)', () => {
  const events: BallEvent[] = [];
  it('ground: reaches the distance at about the arrival speed', () => {
    const k = TUNING.pass;
    for (const d of [8, 14, 20]) {
      const v0 = groundPassSpeed(d, k.groundArrivalSpeed, k.groundMinSpeed, k.groundMaxSpeed, TUNING.ball);
      const b = createBall(-15, 0);
      b.vx = v0;
      let speedAt = 0;
      for (let i = 0; i < 600 && b.x < -15 + d; i++) {
        stepBall(b, [], TUNING, createRng(1), DT, events);
        speedAt = b.vx;
      }
      if (v0 > k.groundMinSpeed && v0 < k.groundMaxSpeed) expect(speedAt).toBeCloseTo(k.groundArrivalSpeed, 0);
      else expect(speedAt).toBeGreaterThan(0);
    }
  });

  it('lofted: lands at the asked distance', () => {
    const k = TUNING.pass;
    for (const d of [7, 12, 18]) {
      const v = loftPassSpeed(d, k.loftAngle, k.loftMaxSpeed, TUNING.ball);
      const b = createBall(-15, 0);
      b.vx = v * Math.cos(k.loftAngle);
      b.vz = v * Math.sin(k.loftAngle);
      let landed = NaN;
      for (let i = 0; i < 600; i++) {
        events.length = 0;
        stepBall(b, [], TUNING, createRng(1), DT, events);
        if (events.some((e) => e.type === 'floor')) {
          landed = b.x + 15;
          break;
        }
      }
      expect(Math.abs(landed - d)).toBeLessThan(0.35);
    }
  });
});

describe('passing to the teammates (world)', () => {
  it('a tapped pass reaches the teammate on the ground at a controllable speed', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
    });
    const w = createWorld(21, 2);
    takeBall(w, tuning);
    tap(w, aimAt(w, 1), tuning);
    expect(w.passTo).toBe(1);
    expect(w.passLoft).toBe(false);
    expect(w.ball.vz).toBe(0);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 240)).toBeGreaterThanOrEqual(0);
  });

  it('a held pass goes over the top (lofted) and still reaches him', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
    });
    const w = createWorld(22, 2);
    takeBall(w, tuning);
    // Move the teammate further away so the loft is a real one.
    const m = w.players[2]!;
    m.x = m.prevX = 9;
    hold(w, aimAt(w, 2), TUNING.pass.tapTime + 0.1, tuning);
    expect(w.passTo).toBe(2);
    expect(w.passLoft).toBe(true);
    let maxZ = 0;
    expect(
      runUntil(w, cmd(), tuning, () => {
        maxZ = Math.max(maxZ, w.ball.z);
        return w.ball.owner === 2;
      }, 300),
    ).toBeGreaterThanOrEqual(0);
    expect(maxZ).toBeGreaterThan(1);
  });

  it('Light corrects 70 % of the aim towards the receiver; Off goes exactly where aimed', () => {
    const tuning = tuningWith((t) => {
      exact(t);
      t.mates.move = 0;
    });
    const angleOf = (level: 'off' | 'light' | 'strong'): { launched: number; aim: number; exactTo: number } => {
      const w = createWorld(23, 2);
      w.assist = level;
      takeBall(w, tuning);
      const straight = aimAt(w, 1);
      const off = 0.25;
      const aim = aimAt(w, 1, off);
      tap(w, aim, tuning);
      return {
        launched: Math.atan2(w.ball.vy, w.ball.vx),
        aim: Math.atan2(aim.moveY, aim.moveX),
        exactTo: Math.atan2(straight.moveY, straight.moveX),
      };
    };
    const off = angleOf('off');
    expect(off.launched).toBeCloseTo(off.aim, 5);
    const light = angleOf('light');
    // Corrected most of the way (the exact receiver point is near his body centre line).
    const frac = (light.launched - light.aim) / (light.exactTo - light.aim);
    expect(frac).toBeGreaterThan(0.5);
    expect(frac).toBeLessThan(0.95);
    const strong = angleOf('strong');
    expect(Math.abs(strong.launched - strong.exactTo)).toBeLessThan(0.08);
  });

  it('with no teammate in the cone, a tap goes at the no-target speed exactly where aimed', () => {
    const tuning = tuningWith(exact);
    const w = createWorld(24, 2);
    takeBall(w, tuning);
    tap(w, cmd(-1, 0), tuning); // backwards: nobody there
    expect(w.passTo).toBe(-1);
    // (one tick of rolling already happened)
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeCloseTo(TUNING.pass.groundNoTargetSpeed, 0);
    expect(Math.abs(Math.atan2(w.ball.vy, w.ball.vx))).toBeCloseTo(Math.PI, 5);
    expect(w.controlled).toBe(0);
  });

  it('a lofted pass to nobody goes further the longer PASE is held', () => {
    const tuning = tuningWith(exact);
    const launch = (seconds: number): number => {
      const w = createWorld(25, 2);
      takeBall(w, tuning);
      hold(w, cmd(-1, 0), seconds, tuning);
      return Math.hypot(w.ball.vx, w.ball.vy, w.ball.vz);
    };
    const k = TUNING.pass;
    expect(launch(k.tapTime + k.loftChargeTime)).toBeGreaterThan(launch(k.tapTime + 0.05) + 2);
  });

  it('the pass leads a moving receiver', () => {
    const tuning = tuningWith((t) => {
      exact(t);
      t.mates.move = 0;
    });
    const launch = (vy: number): number => {
      const w = createWorld(26, 2);
      takeBall(w, tuning);
      const r = w.players[1]!;
      r.x = r.prevX = 6;
      r.y = r.prevY = 0;
      r.vy = vy;
      tap(w, cmd(1, 0), tuning);
      return Math.atan2(w.ball.vy, w.ball.vx);
    };
    expect(launch(4)).toBeGreaterThan(launch(0) + 0.1);
  });

  it('the ring target follows the stick while carrying the ball', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
    });
    const w = createWorld(27, 2);
    takeBall(w, tuning);
    step(w, aimAt(w, 1), tuning);
    expect(w.aimTarget).toBe(1);
    step(w, aimAt(w, 2), tuning);
    expect(w.aimTarget).toBe(2);
    w.assist = 'off';
    step(w, aimAt(w, 2), tuning);
    expect(w.aimTarget).toBe(-1);
  });

  it('first touch: PASE released just before receiving fires as soon as the ball arrives', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
      t.mates.switchControl = 0;
    });
    const w = createWorld(28, 2);
    takeBall(w, tuning);
    tap(w, aimAt(w, 1), tuning);
    // Mate 1 gives it back; tap PASE (towards mate 2) a moment before it reaches us.
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === -1 && w.passTo === 0, 300)).toBeGreaterThanOrEqual(0);
    const p0 = w.players[0]!;
    expect(runUntil(w, cmd(), tuning, () => Math.hypot(w.ball.x - p0.x, w.ball.y - p0.y) < 1, 300)).toBeGreaterThanOrEqual(0);
    tap(w, aimAt(w, 2), tuning);
    expect(runUntil(w, cmd(), tuning, () => w.passTo === 2, Math.round(TUNING.input.bufferTime * 60))).toBeGreaterThanOrEqual(0);
    expect(w.players[0]!.noPickupTicks).toBeGreaterThan(0); // he touched it first-time
  });

  it('teammates give a lofted pass back lofted (switch off)', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
      t.mates.switchControl = 0;
    });
    const w = createWorld(29, 2);
    takeBall(w, tuning);
    const m = w.players[1]!;
    m.x = m.prevX = 6;
    hold(w, aimAt(w, 1), TUNING.pass.tapTime + 0.1, tuning);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 300)).toBeGreaterThanOrEqual(0);
    expect(m.receivedLoft).toBe(true);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === -1, 120)).toBeGreaterThanOrEqual(0);
    expect(w.passTo).toBe(0);
    expect(w.passLoft).toBe(true);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 0, 300)).toBeGreaterThanOrEqual(0);
  });
});

describe('pass error (deterministic, Pase attribute)', () => {
  it('grows at sprint and shrinks with a better Pase attribute; lofted passes are less precise', () => {
    const p = createPlayer(0, 0, 0);
    const still = passErrorSd(p, [p], false, TUNING);
    p.vx = TUNING.skating.sprintSpeed;
    expect(passErrorSd(p, [p], false, TUNING)).toBeGreaterThan(still * 2);
    p.vx = 0;
    p.passing = 99;
    expect(passErrorSd(p, [p], false, TUNING)).toBeLessThan(still);
    expect(passErrorSd(p, [p], true, TUNING)).toBeGreaterThan(passErrorSd(p, [p], false, TUNING));
  });

  it('same seed and inputs → same passes', () => {
    const run = (): string => {
      const w = createWorld(31, 2);
      takeBall(w, TUNING);
      tap(w, aimAt(w, 1), TUNING);
      step(w, cmd(), TUNING, 200);
      return JSON.stringify(w);
    };
    expect(run()).toBe(run());
  });
});
