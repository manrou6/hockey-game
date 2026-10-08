import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { createBall } from '../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createPlayer, wrapAngle } from '../../src/sim/player';
import {
  aimAhead,
  assistParams,
  choosePassTarget,
  createPassPlan,
  planPass,
  PASS_GROUND,
  spaceMeet,
  spaceWeight,
  type AssistParams,
} from '../../src/sim/pass';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

// Pass into space (P7, v0.1.22): a running teammate can be the receiver although the aim is
// ahead of him (outside the normal cone); optionally the ball goes to the point of his path the
// aim crosses (assist.<level>SpaceRespect, off by default).

function tuningWith(patch: (t: Tuning) => void): Tuning {
  const t = structuredClone(TUNING);
  patch(t);
  return t;
}

const cmd = (moveX = 0, moveY = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), moveX, moveY, ...extra });
const deg = (d: number): number => (d * Math.PI) / 180;

/** The passer at the origin, a teammate 10 m ahead (+x) running to +y (counter-clockwise) at `speed`. */
function runnerSetup(speed = 6.5): ReturnType<typeof createPlayer>[] {
  const p = createPlayer(0, 0, 0);
  const r = createPlayer(1, 10, 0);
  r.vx = 0;
  r.vy = speed;
  r.heading = Math.PI / 2;
  return [p, r];
}

describe('aimAhead: how far the aim is rotated towards where the teammate is running', () => {
  it('positive when aiming on the side he runs to, negative on the other, −Infinity if he is not running across', () => {
    const [p, r] = runnerSetup();
    expect(aimAhead(p!, r!, deg(20), 2.5)).toBeCloseTo(deg(20), 6); // CCW and he runs CCW
    expect(aimAhead(p!, r!, deg(-20), 2.5)).toBeCloseTo(deg(-20), 6);
    r!.vy = -6.5; // now running clockwise: the signs swap
    expect(aimAhead(p!, r!, deg(20), 2.5)).toBeCloseTo(deg(-20), 6);
    expect(aimAhead(p!, r!, deg(-20), 2.5)).toBeCloseTo(deg(20), 6);
    r!.vy = 1; // jogging across: slower than the minimum
    expect(aimAhead(p!, r!, deg(20), 2.5)).toBe(Number.NEGATIVE_INFINITY);
    r!.vx = 7;
    r!.vy = 0; // running straight away from the passer: not across the line of sight
    expect(aimAhead(p!, r!, deg(20), 2.5)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('who the pass goes to: a running teammate, aimed ahead of', () => {
  const cone = 0.6; // Mitjana
  const space = 0.6;
  it('is chosen up to spaceCone beyond the cone on the side he runs to, not on the other side', () => {
    const [p, r] = runnerSetup();
    const players = [p!, r!];
    expect(choosePassTarget(players, 0, deg(30), cone, space, 2.5)).toBe(1); // inside the cone anyway
    expect(choosePassTarget(players, 0, deg(50), cone, space, 2.5)).toBe(1); // 50° ahead of him: space
    expect(choosePassTarget(players, 0, deg(50), cone, 0, 2.5)).toBe(-1); // the old behaviour: nobody
    expect(choosePassTarget(players, 0, deg(-50), cone, space, 2.5)).toBe(-1); // behind him: no
    expect(choosePassTarget(players, 0, deg(cone * 57.3 + space * 57.3 + 5), cone, space, 2.5)).toBe(-1); // too far ahead
  });
  it('only if he is really running: a standing or slow teammate keeps the normal cone', () => {
    const [p, r] = runnerSetup(1);
    expect(choosePassTarget([p!, r!], 0, deg(50), cone, space, 2.5)).toBe(-1);
  });
  it('the best aimed teammate still wins when two are candidates', () => {
    const [p, r] = runnerSetup();
    const other = createPlayer(2, 8, 6);
    // Aim straight at "other" (37° ccw from +x): inside the cone, 0° off. The runner is 37° behind that aim.
    const aim = Math.atan2(6, 8);
    expect(choosePassTarget([p!, r!, other], 0, aim, cone, space, 2.5)).toBe(2);
  });
});

describe('assist parameters of the pass into space', () => {
  const a: AssistParams = { cone: 0, correction: 0, spaceRespect: 0, spaceCone: 0, spaceDeadzone: 0, spaceRamp: 0, spaceMinSpeed: 0 };
  it('off has none; the levels share the range; the respect is per level and off by default', () => {
    expect(assistParams('off', TUNING, a).spaceCone).toBe(0);
    for (const level of ['light', 'medium', 'strong'] as const) {
      const x = assistParams(level, TUNING, a);
      expect(x.spaceCone).toBe(TUNING.assist.spaceCone);
      expect(x.spaceMinSpeed).toBe(TUNING.assist.spaceMinSpeed);
      expect(x.spaceRespect).toBe(0);
    }
    const t = tuningWith((q) => {
      q.assist.mediumSpaceRespect = 0.6;
    });
    expect(assistParams('medium', t, a).spaceRespect).toBe(0.6);
    expect(assistParams('light', t, a).spaceRespect).toBe(0);
  });
});

describe('spaceWeight: from the dead zone, easing in over the ramp, scaled by the respect', () => {
  const a: AssistParams = { cone: 0.6, correction: 0.85, spaceRespect: 0.8, spaceCone: 0.6, spaceDeadzone: 0.3, spaceRamp: 0.2, spaceMinSpeed: 2.5 };
  it('is 0 below the dead zone, grows over the ramp and caps at the respect', () => {
    const [p, r] = runnerSetup();
    expect(spaceWeight(p!, r!, 0.25, a)).toBe(0);
    expect(spaceWeight(p!, r!, 0.4, a)).toBeCloseTo(0.8 * 0.5, 6);
    expect(spaceWeight(p!, r!, 0.5, a)).toBeCloseTo(0.8, 6);
    expect(spaceWeight(p!, r!, 0.9, a)).toBeCloseTo(0.8, 6);
    expect(spaceWeight(p!, r!, -0.5, a)).toBe(0); // behind him
  });
  it('is 0 whenever the respect is 0', () => {
    const [p, r] = runnerSetup();
    expect(spaceWeight(p!, r!, 0.5, { ...a, spaceRespect: 0 })).toBe(0);
  });
});

describe('spaceMeet: the point of his path the aim crosses', () => {
  const ball = createBall(0.5, 0);
  it('is where the aimed line crosses his straight path', () => {
    const [, r] = runnerSetup(); // at (10, 0), running +y at 6.5 m/s
    // From the ball (0.5, 0) aiming at (10, 4.5) crosses his path x = 10 at y = 4.5, i.e. 0.69 s ahead.
    const aim = Math.atan2(4.5, 9.5);
    const m = spaceMeet(ball, aim, r!, TUNING, { x: 0, y: 0 });
    expect(m.x).toBeCloseTo(10, 6);
    expect(m.y).toBeCloseTo(4.5, 6);
  });
  it('is limited to spaceMinTime..spaceMaxTime ahead of him, and kept inside the boards', () => {
    const [, r] = runnerSetup();
    const k = TUNING.assist;
    const near = spaceMeet(ball, Math.atan2(0.2, 9.5), r!, TUNING, { x: 0, y: 0 });
    expect(near.y).toBeCloseTo(6.5 * k.spaceMinTime, 6);
    // Aimed parallel to him or past his direction: the farthest point (but inside the boards: width 20).
    const far = spaceMeet(ball, deg(100), r!, TUNING, { x: 0, y: 0 });
    expect(far.y).toBeCloseTo(Math.min(9, 6.5 * k.spaceMaxTime), 6);
    const slow = tuningWith((t) => {
      t.assist.spaceMaxTime = 4;
    });
    expect(spaceMeet(ball, deg(100), r!, slow, { x: 0, y: 0 }).y).toBeCloseTo(9, 6); // 20 / 2 − 1 m margin
  });
});

describe('planPass with the pass into space', () => {
  const plan = (t: Tuning, aimDeg: number): ReturnType<typeof createPassPlan> => {
    const [p, r] = runnerSetup();
    const ball = createBall(0.5, 0);
    return planPass([p!, r!], ball, 0, cmd(Math.cos(deg(aimDeg)), Math.sin(deg(aimDeg))), 'medium', PASS_GROUND, 0, -2, 0, t, createPassPlan());
  };
  it('with the respect at 0 (factory) the plan is exactly the old assist for an aim inside the cone', () => {
    const off = tuningWith((t) => {
      t.assist.spaceCone = 0;
    });
    const a = plan(TUNING, 20);
    const b = plan(off, 20);
    expect(a.target).toBe(1);
    expect(a.angle).toBe(b.angle);
    expect(a.speed).toBe(b.speed);
    expect(a.meetX).toBe(b.meetX);
  });
  it('a running teammate aimed 45° ahead of is now the receiver (before: nobody, the fast 18 m/s no-target pass)', () => {
    const off = tuningWith((t) => {
      t.assist.spaceCone = 0;
    });
    const before = plan(off, 45);
    expect(before.target).toBe(-1);
    expect(before.speed).toBe(TUNING.pass.groundNoTargetSpeed);
    const after = plan(TUNING, 45);
    expect(after.target).toBe(1);
    // Led as a pass to a runner: towards his path, slower than the no-target pass, 15 % of the offset kept.
    expect(after.angle).toBeLessThan(deg(45));
    expect(after.angle).toBeGreaterThan(0);
    expect(after.speed).toBeLessThan(TUNING.pass.groundNoTargetSpeed);
    expect(Number.isNaN(after.meetX)).toBe(false);
  });
  it('with the respect at 1 the ball goes where the aim points (on his path) and further than with 0', () => {
    const full = tuningWith((t) => {
      t.assist.mediumSpaceRespect = 1;
    });
    const aimDeg = 45;
    const a = plan(full, aimDeg);
    const base = plan(TUNING, aimDeg);
    expect(a.target).toBe(1);
    expect(a.angle).toBeCloseTo(Math.atan2(a.meetY - 0, a.meetX - 0.5) , 1);
    expect(Math.abs(wrapAngle(a.angle - deg(aimDeg)))).toBeLessThan(deg(8)); // blade offset aside, along the aim
    expect(Math.abs(a.angle - deg(aimDeg))).toBeLessThan(Math.abs(base.angle - deg(aimDeg)));
    expect(a.meetY).toBeGreaterThan(base.meetY);
  });
});

describe('in the world: a pass aimed ahead of a runner', () => {
  const setup = (t: Tuning, level: 'medium' | 'strong' = 'medium'): WorldState => {
    const w = createWorld(7, 2);
    w.assist = level;
    const step = (c: PlayerCommand): void => stepWorld(w, [c], t);
    for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(cmd(0.5, 0));
    for (let i = 0; i < 60; i++) step(cmd());
    expect(w.ball.owner).toBe(0);
    const p = w.players[0]!;
    const r = w.players[1]!;
    const o = w.players[2]!;
    p.x = p.prevX = -12;
    p.y = p.prevY = 0;
    p.vx = p.vy = 0;
    w.ball.x = w.ball.prevX = p.x + 0.5;
    w.ball.y = w.ball.prevY = p.y - 0.2;
    r.x = r.prevX = -4;
    r.y = r.prevY = -3;
    r.vx = 0;
    r.vy = 6.5;
    r.heading = Math.PI / 2;
    o.x = o.prevX = -18;
    o.y = o.prevY = 8;
    return w;
  };
  const noRun = (t: Tuning): void => {
    t.mates.move = 0;
    t.pass.errorBase = t.pass.errorSprint = t.pass.errorPressure = t.pass.errorOffBalance = 0;
    t.pass.errorPower = 0;
  };
  it('the control goes to him and the ring shows him; without the feature nobody is chosen', () => {
    const t = tuningWith(noRun);
    const w = setup(t);
    // 8 m east, 3 m south of the passer; he runs north: aim 38° ahead of him? aim at his future spot (-4, 3).
    const a = Math.atan2(3 - w.ball.y, -4 - w.ball.x);
    stepWorld(w, [cmd(Math.cos(a), Math.sin(a), { pass: true, passHeld: true })], t);
    expect(w.aimTarget).toBe(1);
    stepWorld(w, [cmd(Math.cos(a), Math.sin(a))], t);
    expect(w.passTo).toBe(1);
    expect(w.controlled).toBe(1);

    const off = tuningWith((q) => {
      noRun(q);
      q.assist.spaceCone = 0;
    });
    const w2 = setup(off);
    stepWorld(w2, [cmd(Math.cos(a), Math.sin(a), { pass: true, passHeld: true })], off);
    expect(w2.aimTarget).toBe(-1);
    stepWorld(w2, [cmd(Math.cos(a), Math.sin(a))], off);
    expect(w2.controlled).toBe(0);
  });
  it('is deterministic', () => {
    const t = tuningWith(noRun);
    const run = (): number[] => {
      const w = setup(t);
      const a = Math.atan2(3 - w.ball.y, -4 - w.ball.x);
      stepWorld(w, [cmd(Math.cos(a), Math.sin(a), { pass: true })], t);
      for (let i = 0; i < 90; i++) stepWorld(w, [cmd()], t);
      return [w.ball.x, w.ball.y, w.players[1]!.x, w.players[1]!.y, w.controlled];
    };
    expect(run()).toEqual(run());
  });
});
