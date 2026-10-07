import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { createBall, type BallEvent, type BallState } from '../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { bladePoint, pickupDistance } from '../../src/sim/dribble';
import { firstTouchFactor } from '../../src/sim/pass';
import { createPlayer, type PlayerState } from '../../src/sim/player';
import {
  RECEIVE_CLEAN,
  RECEIVE_HEAVY,
  RECEIVE_MISS,
  RECEIVE_REBOUND,
  receiveBall,
  receiveDifficulty,
  receiveOutcome,
  type ReceiveOutcome,
} from '../../src/sim/receive';
import { createRng } from '../../src/sim/rng';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

function tuningWith(patch: (t: Tuning) => void): Tuning {
  const t = structuredClone(TUNING);
  patch(t);
  return t;
}

/** A still player facing +x and a ball at his blade moving at (vx, vy) relative to the floor. */
function setup(vx: number, vy = 0): { p: PlayerState; ball: BallState; blade: number } {
  const p = createPlayer(0, 0, 0, 0);
  const b = bladePoint(p, TUNING);
  const ball = createBall(b.x, b.y);
  ball.vx = vx;
  ball.vy = vy;
  return { p, ball, blade: 0 };
}

/** Outcomes of the same reception over many seeds. */
function outcomes(make: () => { p: PlayerState; ball: BallState; blade: number }, tuning = TUNING, seeds = 200): number[] {
  const count = [0, 0, 0, 0];
  for (let seed = 1; seed <= seeds; seed++) {
    const { p, ball, blade } = make();
    count[receiveBall(ball, 0, p, blade, tuning, createRng(seed), [])]!++;
  }
  return count;
}

describe('reception difficulty (F1.4c)', () => {
  it('a slow ball from the front is trivial; faster is harder', () => {
    const slow = setup(-5);
    expect(receiveDifficulty(slow.ball, slow.p, TUNING, 0)).toBe(0);
    const d14 = setup(-14);
    const d22 = setup(-22);
    expect(receiveDifficulty(d22.ball, d22.p, TUNING, 0)).toBeGreaterThan(receiveDifficulty(d14.ball, d14.p, TUNING, 0));
  });

  it('where it comes from: behind is harder than the side, the side harder than the front', () => {
    const front = setup(-14);
    const side = setup(0, 14);
    const behind = setup(14);
    const df = receiveDifficulty(front.ball, front.p, TUNING, 0);
    const ds = receiveDifficulty(side.ball, side.p, TUNING, 0);
    const db = receiveDifficulty(behind.ball, behind.p, TUNING, 0);
    expect(ds).toBeGreaterThan(df);
    expect(db).toBeGreaterThan(ds);
  });

  it('height, bounce, sprint, off balance and stretching each make it harder', () => {
    const base = (): ReturnType<typeof setup> => setup(-14);
    const ref = (() => {
      const s = base();
      return receiveDifficulty(s.ball, s.p, TUNING, 0);
    })();
    const high = base();
    high.ball.z += 0.25;
    expect(receiveDifficulty(high.ball, high.p, TUNING, 0)).toBeGreaterThan(ref);
    const bouncing = base();
    bouncing.ball.vz = 2;
    expect(receiveDifficulty(bouncing.ball, bouncing.p, TUNING, 0)).toBeGreaterThan(ref);
    // Sprinting towards the ball: compare at the same relative speed.
    const sprint = base();
    sprint.p.vx = TUNING.skating.sprintSpeed;
    sprint.ball.vx = -14 + sprint.p.vx;
    expect(receiveDifficulty(sprint.ball, sprint.p, TUNING, 0)).toBeGreaterThan(ref);
    const skid = base();
    skid.p.skidTime = 0.3;
    expect(receiveDifficulty(skid.ball, skid.p, TUNING, 0)).toBeGreaterThan(ref);
    const stretch = base();
    expect(receiveDifficulty(stretch.ball, stretch.p, TUNING, TUNING.dribble.pickupRadius + 0.4)).toBeGreaterThan(ref);
  });

  it('the Control attribute reduces it', () => {
    const poor = setup(-18);
    poor.p.control = 30;
    const good = setup(-18);
    good.p.control = 99;
    expect(receiveDifficulty(good.ball, good.p, TUNING, 0)).toBeLessThan(receiveDifficulty(poor.ball, poor.p, TUNING, 0));
  });

  it('thresholds: clean < heavy < rebound < miss', () => {
    const p = createPlayer(0, 0, 0);
    const r = TUNING.receive;
    expect(receiveOutcome(r.heavyAt - 0.01, TUNING, p)).toBe(RECEIVE_CLEAN);
    expect(receiveOutcome(r.heavyAt, TUNING, p)).toBe(RECEIVE_HEAVY);
    expect(receiveOutcome(r.reboundAt, TUNING, p)).toBe(RECEIVE_REBOUND);
    expect(receiveOutcome(r.missAt, TUNING, p)).toBe(RECEIVE_MISS);
  });
});

describe('reception outcomes (one deterministic roll)', () => {
  it('a slow ball is always controlled cleanly', () => {
    expect(outcomes(() => setup(-6))[RECEIVE_CLEAN]).toBe(200);
  });

  it('a normal pass speed (14 m/s) is mostly clean; a hard ball (26 m/s) is never clean and sometimes rebounds', () => {
    const normal = outcomes(() => setup(-14));
    expect(normal[RECEIVE_CLEAN]!).toBeGreaterThan(150);
    const hard = outcomes(() => setup(-26));
    expect(hard[RECEIVE_CLEAN]).toBe(0);
    expect(hard[RECEIVE_REBOUND]!).toBeGreaterThan(20);
  });

  it('the same ball from behind, at a sprint, is much worse', () => {
    const behind = outcomes(() => {
      const s = setup(-14 + 20);
      s.p.vx = TUNING.skating.sprintSpeed;
      s.ball.vx = s.p.vx + 14;
      return s;
    });
    const front = outcomes(() => setup(-14));
    expect(behind[RECEIVE_CLEAN]!).toBeLessThan(front[RECEIVE_CLEAN]! / 2);
    expect(behind[RECEIVE_REBOUND]! + behind[RECEIVE_MISS]!).toBeGreaterThan(0);
  });

  it('a better Control attribute gives more clean receptions', () => {
    const at = (control: number): number =>
      outcomes(() => {
        const s = setup(-20);
        s.p.control = control;
        return s;
      })[RECEIVE_CLEAN]!;
    expect(at(99)).toBeGreaterThan(at(40));
  });

  it('clean: he has it on the stick; heavy: it stays well off the stick at first', () => {
    const force = (e: number): Tuning => tuningWith((t) => {
      t.receive.randomness = 0;
      t.receive.heavyAt = e;
    });
    const a = setup(-6);
    expect(receiveBall(a.ball, 0, a.p, 0, force(5), createRng(1), [])).toBe(RECEIVE_CLEAN);
    expect(a.ball.owner).toBe(0);
    expect(a.ball.separation).toBeLessThan(0.3);
    expect(a.p.firstTouchTicks).toBeGreaterThan(0);
    const b = setup(-6);
    expect(receiveBall(b.ball, 0, b.p, 0, force(-1), createRng(1), [])).toBe(RECEIVE_HEAVY);
    expect(b.ball.owner).toBe(0);
    expect(b.ball.separation).toBe(TUNING.receive.heavySeparation);
  });

  it('rebound: the ball bounces back off the stick, slower, popping up; he cannot touch it for lockTime', () => {
    const t = tuningWith((x) => {
      x.receive.randomness = 0;
      x.receive.heavyAt = x.receive.reboundAt = -2;
      x.receive.missAt = 10;
    });
    const s = setup(-14);
    const events: BallEvent[] = [];
    expect(receiveBall(s.ball, 0, s.p, 0, t, createRng(3), events)).toBe(RECEIVE_REBOUND);
    expect(s.ball.owner).toBe(-1);
    expect(s.ball.vx).toBeGreaterThan(0); // back the way it came
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeLessThan(14 * TUNING.receive.reboundKeep + 0.01);
    expect(s.ball.vz).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'player')).toBe(true);
    expect(s.p.noPickupTicks).toBe(Math.round(TUNING.receive.lockTime * 60));
    expect(pickupDistance(s.ball, s.p, t)).toBe(-1); // one roll per approach
  });

  it('miss: the ball goes past untouched; faster than maxRelSpeed always misses', () => {
    const s = setup(-(TUNING.receive.maxRelSpeed + 1));
    expect(receiveBall(s.ball, 0, s.p, 0, TUNING, createRng(1), [])).toBe(RECEIVE_MISS);
    expect(s.ball.owner).toBe(-1);
    expect(s.ball.vx).toBe(-(TUNING.receive.maxRelSpeed + 1));
    expect(s.p.noPickupTicks).toBeGreaterThan(0);
  });

  it('is deterministic: same seed, same outcomes', () => {
    const seq = (): ReceiveOutcome[] => {
      const rng = createRng(77);
      const out: ReceiveOutcome[] = [];
      for (let i = 0; i < 30; i++) {
        const s = setup(-10 - i * 0.5);
        out.push(receiveBall(s.ball, 0, s.p, 0, TUNING, rng, []));
      }
      return out;
    };
    expect(seq()).toEqual(seq());
  });
});

describe('reception zone', () => {
  it('only the receiver of an aimed pass reaches a ball near his body but away from his blade (stretching)', () => {
    const p = createPlayer(0, 0, 0, 0);
    const ball = createBall(-0.2, 0.45); // beside him, on the other side from the blade
    expect(pickupDistance(ball, p, TUNING)).toBe(-1);
    const blade = pickupDistance(ball, p, TUNING, TUNING.receive.reach);
    expect(blade).toBeGreaterThan(TUNING.dribble.pickupRadius);
  });

  it('a ball higher than pickupMaxHeight cannot be received', () => {
    const s = setup(-5);
    s.ball.z += TUNING.dribble.pickupMaxHeight + 0.05;
    expect(pickupDistance(s.ball, s.p, TUNING, TUNING.receive.reach)).toBe(-1);
  });
});

describe('first-touch pass', () => {
  it('a pass right after receiving is less exact (more after a hard reception); later it is normal', () => {
    const p = createPlayer(0, 0, 0);
    expect(firstTouchFactor(p, TUNING)).toBe(1);
    p.firstTouchTicks = 5;
    p.receiveDifficulty = 0;
    const easy = firstTouchFactor(p, TUNING);
    expect(easy).toBeCloseTo(TUNING.receive.firstTouchError);
    p.receiveDifficulty = 0.5;
    expect(firstTouchFactor(p, TUNING)).toBeGreaterThan(easy);
  });

  it('in the world: the first-touch window runs out after firstTouchWindow', () => {
    const w: WorldState = createWorld(1);
    const c: PlayerCommand = { ...emptyCommand(), moveX: 0.5 };
    let t = 0;
    while (w.ball.owner !== 0 && t++ < 200) stepWorld(w, [c], TUNING);
    expect(w.ball.owner).toBe(0);
    expect(w.lastReceptionPlayer).toBe(0);
    expect(w.lastReceptionOutcome).toBe(RECEIVE_CLEAN);
    // It counts down from the reception (this tick already took one).
    expect(w.players[0]!.firstTouchTicks).toBe(Math.round(TUNING.receive.firstTouchWindow * 60));
    for (let i = 0; i < Math.round(TUNING.receive.firstTouchWindow * 60) + 1; i++) stepWorld(w, [emptyCommand()], TUNING);
    expect(firstTouchFactor(w.players[0]!, TUNING)).toBe(1);
  });
});

describe('passes and receptions in the world', () => {
  it("a rebound off the receiver's stick is recorded as the last reception and ends the pass", () => {
    const t = tuningWith((x) => {
      x.receive.randomness = 0;
      x.receive.heavyAt = x.receive.reboundAt = -2;
      x.receive.missAt = 10;
      x.mates.move = 0;
    });
    const w = createWorld(5, 2);
    for (let i = 0; i < 120 && w.ball.owner !== 0; i++) stepWorld(w, [{ ...emptyCommand(), moveX: 0.5 }], TUNING);
    for (let i = 0; i < 30; i++) stepWorld(w, [emptyCommand()], TUNING);
    expect(w.ball.owner).toBe(0);
    const r = w.players[1]!;
    const a = Math.atan2(r.y - w.ball.y, r.x - w.ball.x);
    stepWorld(w, [{ ...emptyCommand(), moveX: Math.cos(a), moveY: Math.sin(a), pass: true }], t);
    expect(w.passTo).toBe(1);
    let rebounded = false;
    for (let i = 0; i < 240 && !rebounded; i++) {
      stepWorld(w, [emptyCommand()], t);
      rebounded = w.lastReceptionPlayer === 1 && w.lastReceptionOutcome === RECEIVE_REBOUND;
    }
    expect(rebounded).toBe(true);
    expect(w.ball.owner).toBe(-1);
    stepWorld(w, [emptyCommand()], t);
    expect(w.passTo).toBe(-1);
  });
});
