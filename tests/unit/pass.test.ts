import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { createBall, GRAVITY, stepBall, type BallEvent } from '../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createPlayer } from '../../src/sim/player';
import {
  PASS_DRIVE,
  PASS_GROUND,
  PASS_LOB,
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

describe('PASE button: tap = ground, hold = driven lofted, hold longer = lob (released = it leaves)', () => {
  const holdFor = (seconds: number): ReturnType<typeof createPlayer> => {
    const p = createPlayer(0, 0, 0);
    updatePassButton(p, cmd(0, 0, { pass: true, passHeld: true }), TUNING, DT);
    for (let i = 0; i < Math.round(seconds / DT) - 1; i++) updatePassButton(p, cmd(0, 0, { passHeld: true }), TUNING, DT);
    expect(p.bufPass).toBe(0); // nothing leaves while it's held
    updatePassButton(p, cmd(), TUNING, DT);
    expect(p.passHold).toBe(-1);
    expect(p.bufPass).toBeGreaterThan(0);
    return p;
  };
  it('a tap (press and release in one tick) is a ground pass', () => {
    const p = createPlayer(0, 0, 0);
    expect(updatePassButton(p, cmd(0, 0, { pass: true, passHeld: false }), TUNING, DT)).toBe('pressed');
    expect(p.bufPass).toBeGreaterThan(0);
    expect(p.passKind).toBe(PASS_GROUND);
  });

  it('the three levels by hold time, and the lob charge', () => {
    const k = TUNING.pass;
    expect(holdFor(k.tapTime - 2 * DT).passKind).toBe(PASS_GROUND);
    expect(holdFor(k.tapTime + 2 * DT).passKind).toBe(PASS_DRIVE);
    expect(holdFor(k.lobTime - 2 * DT).passKind).toBe(PASS_DRIVE);
    const lob = holdFor(k.lobTime + k.loftChargeTime / 2);
    expect(lob.passKind).toBe(PASS_LOB);
    expect(lob.passCharge).toBeCloseTo(0.5, 1);
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
    expect(w.passKind).toBe(PASS_GROUND);
    expect(w.ball.vz).toBe(0);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 240)).toBeGreaterThanOrEqual(0);
  });

  it('held: the driven lofted pass rises from the floor, peaks low and lands just before him (real physics)', () => {
    const tuning = tuningWith((t) => {
      exact(t);
      t.mates.move = 0;
    });
    const w = createWorld(22, 2);
    takeBall(w, tuning);
    const m = w.players[2]!;
    m.x = m.prevX = 9;
    hold(w, aimAt(w, 2), TUNING.pass.tapTime + 0.1, tuning);
    expect(w.passTo).toBe(2);
    expect(w.passKind).toBe(PASS_DRIVE);
    expect(w.ball.vz).toBeGreaterThan(0); // leaves the stick from the floor, going up
    const k = TUNING.pass;
    const meet = { x: w.meetX, y: w.meetY };
    let maxZ = 0;
    let landed = -1;
    expect(
      runUntil(w, cmd(), tuning, () => {
        maxZ = Math.max(maxZ, w.ball.z);
        if (landed < 0 && w.events.some((e) => e.type === 'floor')) landed = Math.hypot(w.ball.x - meet.x, w.ball.y - meet.y);
        return w.ball.owner === 2;
      }, 300),
    ).toBeGreaterThanOrEqual(0);
    expect(maxZ).toBeGreaterThan(k.driveMaxHeight * 0.7);
    expect(maxZ).toBeLessThan(k.driveMaxHeight * 1.15);
    expect(Math.abs(landed - k.driveLandShort)).toBeLessThan(0.6);
  });

  it('long lofted passes reach: a 28 m driven pass lands just before him (it flies a bit higher), a 30 m lob too', () => {
    const tuning = tuningWith((t) => {
      exact(t);
      t.mates.move = 0;
    });
    for (const [seconds, D, short] of [
      [TUNING.pass.tapTime + 0.1, 28, TUNING.pass.driveLandShort],
      [TUNING.pass.lobTime + 0.1, 30, TUNING.pass.loftLandShort],
    ] as const) {
      const w = createWorld(24, 2);
      const p = w.players[0]!;
      p.x = p.prevX = -15;
      p.y = p.prevY = 4;
      w.ball.x = w.ball.prevX = -14.45;
      w.ball.y = w.ball.prevY = 3.86;
      step(w, cmd(), tuning, 30);
      expect(w.ball.owner).toBe(0);
      const m = w.players[1]!;
      m.x = m.prevX = -15 + D;
      m.y = m.prevY = 4;
      w.players[2]!.y = w.players[2]!.prevY = -8;
      hold(w, cmd(1, 0), seconds, tuning);
      expect(w.passTo).toBe(1);
      let landed = Number.NaN;
      for (let i = 0; i < 300 && Number.isNaN(landed) && w.ball.owner < 0; i++) {
        step(w, cmd(), tuning);
        if (w.events.some((e) => e.type === 'floor')) landed = m.x - w.ball.x;
      }
      // Lands about `short` (+ the stick reach) before him, never far short or past him.
      if (!Number.isNaN(landed)) {
        expect(landed).toBeGreaterThan(0);
        expect(landed).toBeLessThan(short + 1.5);
      }
      expect(runUntil(w, cmd(), tuning, () => w.ball.owner >= 0, 300)).toBeGreaterThanOrEqual(0);
      expect(w.ball.owner).toBe(1);
    }
  });

  it('a lofted pass is pure physics after the release: no correction in flight', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
    });
    for (const seconds of [TUNING.pass.tapTime + 0.1, TUNING.pass.lobTime + 0.1]) {
      const w = createWorld(23, 2);
      takeBall(w, tuning);
      const m = w.players[2]!;
      m.x = m.prevX = 9;
      hold(w, aimAt(w, 2), seconds, tuning);
      const dir = Math.atan2(w.ball.vy, w.ball.vx);
      let vz = w.ball.vz;
      // Until it first touches the floor: same horizontal direction, and vertical speed only
      // changed by gravity (and a little air drag).
      for (let i = 0; i < 200 && !w.events.some((e) => e.type === 'floor'); i++) {
        step(w, cmd(), tuning);
        // Stop at the first floor contact or when someone takes it (on the stick: not flying).
        if (w.events.some((e) => e.type === 'floor') || w.ball.owner >= 0) break;
        expect(Math.atan2(w.ball.vy, w.ball.vx)).toBeCloseTo(dir, 6);
        expect(w.ball.vz - vz).toBeLessThan(-GRAVITY * DT * 0.95);
        expect(w.ball.vz - vz).toBeGreaterThan(-GRAVITY * DT * 1.2);
        vz = w.ball.vz;
      }
    }
  });

  it('held longer: the lob is a high arc and still reaches him', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
    });
    const w = createWorld(22, 2);
    takeBall(w, tuning);
    const m = w.players[2]!;
    m.x = m.prevX = 9;
    hold(w, aimAt(w, 2), TUNING.pass.lobTime + 0.1, tuning);
    expect(w.passKind).toBe(PASS_LOB);
    let maxZ = 0;
    expect(
      runUntil(w, cmd(), tuning, () => {
        maxZ = Math.max(maxZ, w.ball.z);
        return w.ball.owner === 2;
      }, 300),
    ).toBeGreaterThanOrEqual(0);
    expect(maxZ).toBeGreaterThan(TUNING.pass.driveMaxHeight + 0.3);
  });

  it('Light keeps 30 % of your aiming error (not of the lead); Strong none; Off goes exactly where aimed', () => {
    const tuning = tuningWith((t) => {
      exact(t);
      t.mates.move = 0;
    });
    const off = 0.25;
    const launch = (level: 'off' | 'light' | 'strong', offset: number): { launched: number; aim: number } => {
      const w = createWorld(23, 2);
      w.assist = level;
      takeBall(w, tuning);
      const p = w.players[0]!;
      const r = w.players[1]!;
      // Aim from the player at the teammate, offset by `offset`.
      const a = Math.atan2(r.y - p.y, r.x - p.x) + offset;
      tap(w, cmd(Math.cos(a), Math.sin(a)), tuning);
      return { launched: Math.atan2(w.ball.vy, w.ball.vx), aim: a };
    };
    const o = launch('off', off);
    expect(o.launched).toBeCloseTo(o.aim, 5);
    const strongExact = launch('strong', 0).launched;
    expect(launch('strong', off).launched).toBeCloseTo(strongExact, 5);
    expect(launch('light', off).launched - strongExact).toBeCloseTo((1 - TUNING.assist.lightCorrection) * off, 3);
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

  it('a lob to nobody goes further the longer PASE is held; a driven one to nobody lands at its set distance', () => {
    const tuning = tuningWith(exact);
    const launch = (seconds: number): WorldState => {
      const w = createWorld(25, 2);
      takeBall(w, tuning);
      hold(w, cmd(-1, 0), seconds, tuning);
      return w;
    };
    const k = TUNING.pass;
    const speed = (w: WorldState): number => Math.hypot(w.ball.vx, w.ball.vy, w.ball.vz);
    expect(speed(launch(k.lobTime + k.loftChargeTime))).toBeGreaterThan(speed(launch(k.lobTime + 0.05)) + 2);
    // Driven to nobody (assist off), along the rink with room to land.
    const d = createWorld(25, 2);
    d.assist = 'off';
    takeBall(d, tuning);
    hold(d, cmd(1, 0), k.tapTime + 0.1, tuning);
    const x0 = d.ball.x;
    for (let i = 0; i < 300 && !d.events.some((e) => e.type === 'floor'); i++) step(d, cmd(), tuning);
    expect(Math.abs(d.ball.x - x0 - k.driveNoTargetDistance)).toBeLessThan(0.6);
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

  it('teammates give the pass back the same kind (switch off)', () => {
    for (const [seconds, kind] of [
      [TUNING.pass.tapTime + 0.1, PASS_DRIVE],
      [TUNING.pass.lobTime + 0.1, PASS_LOB],
    ] as const) {
      const tuning = tuningWith((t) => {
        t.mates.move = 0;
        t.mates.switchControl = 0;
      });
      const w = createWorld(29, 2);
      takeBall(w, tuning);
      const m = w.players[1]!;
      m.x = m.prevX = 6;
      hold(w, aimAt(w, 1), seconds, tuning);
      expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 300)).toBeGreaterThanOrEqual(0);
      expect(m.receivedKind).toBe(kind);
      expect(runUntil(w, cmd(), tuning, () => w.ball.owner === -1, 120)).toBeGreaterThanOrEqual(0);
      expect(w.passTo).toBe(0);
      expect(w.passKind).toBe(kind);
      expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 0, 300)).toBeGreaterThanOrEqual(0);
    }
  });

  it('the receiver is locked when PASE is pressed: moving the stick while charging does not change it', () => {
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
    });
    const w = createWorld(30, 2);
    takeBall(w, tuning);
    const toOne = aimAt(w, 1);
    const toTwo = aimAt(w, 2);
    step(w, { ...toOne, pass: true, passHeld: true }, tuning);
    expect(w.aimTarget).toBe(1);
    step(w, { ...toTwo, passHeld: true }, tuning, 20); // stick swung to the other teammate
    expect(w.aimTarget).toBe(1); // the ring stays
    step(w, toTwo, tuning);
    expect(w.passTo).toBe(1);
  });

  it('the passer never chases or blocks his own pass (even passing sideways at a sprint)', () => {
    // Switch off: the human keeps sprinting with the passer (with it on, the stick would
    // drive the receiver).
    const tuning = tuningWith((t) => {
      t.mates.move = 0;
      t.mates.switchControl = 0;
    });
    const w = createWorld(31, 2);
    takeBall(w, tuning);
    step(w, cmd(1, 0, { sprint: true }), tuning, 50);
    const r = w.players[1]!;
    r.x = r.prevX = w.players[0]!.x + 2;
    r.y = r.prevY = w.players[0]!.y + 6;
    const a = Math.atan2(r.y - w.ball.y, r.x - w.ball.x);
    step(w, cmd(Math.cos(a), Math.sin(a), { sprint: true, pass: true }), tuning);
    expect(w.passTo).toBe(1);
    // Keep sprinting straight on: the ball must not bounce off the passer.
    expect(runUntil(w, cmd(1, 0, { sprint: true }), tuning, () => w.ball.owner >= 0 || w.events.some((e) => e.type === 'player'), 200)).toBeGreaterThanOrEqual(0);
    expect(w.ball.owner).toBe(1);
  });

  it('Strong helps more than Light, and aiming still matters with Light', () => {
    const rate = (level: 'light' | 'strong'): number => {
      let ok = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const w = createWorld(seed, 2);
        w.assist = level;
        takeBall(w, TUNING);
        step(w, cmd(0.8, 0.2), TUNING, 50);
        const target = 1 + (seed % 2);
        // Aimed 30° off the teammate (seen from the player): outside Light's cone.
        const p = w.players[0]!;
        const r = w.players[target]!;
        const a = Math.atan2(r.y - p.y, r.x - p.x) + (seed % 2 ? 1 : -1) * 0.52;
        tap(w, cmd(Math.cos(a), Math.sin(a)), TUNING);
        if (runUntil(w, cmd(), TUNING, () => w.ball.owner >= 0, 240) >= 0 && w.ball.owner === target) ok++;
      }
      return ok / 30;
    };
    const light = rate('light');
    const strong = rate('strong');
    expect(strong).toBeGreaterThan(light);
    expect(strong).toBeGreaterThan(0.9);
    expect(light).toBeLessThan(0.5);
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
