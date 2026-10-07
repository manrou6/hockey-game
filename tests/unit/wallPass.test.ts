import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { createBall, stepBall, type BallEvent } from '../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createPlayer } from '../../src/sim/player';
import { createRng } from '../../src/sim/rng';
import { createWallPlan, planWallPass } from '../../src/sim/wallPass';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

const DEG = Math.PI / 180;

function tuningWith(patch: (t: Tuning) => void): Tuning {
  const t = structuredClone(TUNING);
  t.mates.move = 0;
  patch(t);
  return t;
}

const cmd = (x = 0, y = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), moveX: x, moveY: y, ...extra });
const step = (w: WorldState, c: PlayerCommand, t: Tuning, n = 1): void => {
  for (let i = 0; i < n; i++) stepWorld(w, [c], t);
};

/** The human skating along +x at the near-board side, ball on the stick, mates out of the way. */
function skating(seed: number, t: Tuning, level: 'off' | 'light' | 'strong' = 'strong', sprint = false): WorldState {
  const w = createWorld(seed, 2);
  w.assist = level;
  for (const [i, y] of [[1, -9], [2, 9]] as const) {
    w.players[i]!.x = w.players[i]!.prevX = -19;
    w.players[i]!.y = w.players[i]!.prevY = y;
  }
  for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(w, cmd(0.5, 0), t);
  step(w, cmd(), t, 60);
  const p = w.players[0]!;
  p.x = p.prevX = -14;
  p.y = p.prevY = -1;
  p.heading = 0;
  w.ball.x = w.ball.prevX = p.x + 0.6;
  w.ball.y = w.ball.prevY = p.y - 0.2;
  w.ball.vx = w.ball.vy = 0;
  step(w, cmd(1, 0, { sprint }), t, 90);
  return w;
}

/** Tap PASE aiming `deg` above the +x axis (towards the far board) while skating on. */
function tapAt(w: WorldState, deg: number, t: Tuning, sprint = false): void {
  const a = deg * DEG;
  step(w, cmd(Math.cos(a), Math.sin(a), { pass: true, sprint }), t);
}

describe('wall pass planner (F1.4d)', () => {
  it('skating along the boards and aiming at the far one gives a plan whose bounce meets his stick (no random error)', () => {
    const t = tuningWith((x) => {
      x.ball.boardJitter = 0;
    });
    const p = createPlayer(0, -14, -1, 0);
    p.vx = 8.4;
    const ball = createBall(-13.4, -1.2);
    const plan = createWallPlan();
    expect(planWallPass(p, ball, 50 * DEG, false, t.wall.strongCone, 1, t.pass.groundMinSpeed, t.pass.groundMaxSpeed, t, plan)).toBe(true);
    // The contact point is on the far board, ahead of the passer and the meeting point beyond it.
    expect(plan.wallY).toBeGreaterThan(9);
    expect(plan.wallX).toBeGreaterThan(-13);
    expect(plan.meetX).toBeGreaterThan(plan.wallX);
    expect(plan.speed).toBeGreaterThanOrEqual(t.pass.groundMinSpeed);
    // Fly the plan with the real ball physics: it comes close to the meeting point.
    const b = createBall(ball.x, ball.y);
    b.vx = Math.cos(plan.angle) * plan.speed;
    b.vy = Math.sin(plan.angle) * plan.speed;
    const events: BallEvent[] = [];
    const rng = createRng(1);
    let best = Infinity;
    let bounced = false;
    for (let i = 0; i < 360; i++) {
      stepBall(b, [], t, rng, 1 / 60, events);
      if (events.some((e) => e.type === 'board')) bounced = true;
      if (bounced) best = Math.min(best, Math.hypot(b.x - plan.meetX, b.y - plan.meetY));
      events.length = 0;
    }
    expect(bounced).toBe(true);
    expect(best).toBeLessThan(0.5);
  });

  it('only when the stick is near the ideal direction: aiming along the board, or with the assist off, it is not a wall pass', () => {
    const p = createPlayer(0, -14, -1, 0);
    p.vx = 8.4;
    const ball = createBall(-13.4, -1.2);
    const plan = createWallPlan();
    const k = TUNING.wall;
    expect(planWallPass(p, ball, 5 * DEG, false, k.strongCone, 1, 12, 30, TUNING, plan)).toBe(false);
    expect(planWallPass(p, ball, 50 * DEG, false, 0, 1, 12, 30, TUNING, plan)).toBe(false); // assist off: cone 0
    const off = tuningWith((x) => {
      x.wall.assist = 0;
    });
    expect(planWallPass(p, ball, 50 * DEG, false, k.strongCone, 1, 12, 30, off, plan)).toBe(false);
  });

  it('the correction pulls the direction to the ideal one (never less than wall.minCorrection with the real assist)', () => {
    const p = createPlayer(0, -14, -1, 0);
    p.vx = 8.4;
    const ball = createBall(-13.4, -1.2);
    const full = createWallPlan();
    const none = createWallPlan();
    const k = TUNING.wall;
    planWallPass(p, ball, 55 * DEG, false, k.strongCone, 1, 12, 30, TUNING, full);
    planWallPass(p, ball, 55 * DEG, false, k.strongCone, 0, 12, 30, TUNING, none);
    expect(Math.abs(none.angle - 55 * DEG)).toBeLessThan(1e-9);
    expect(Math.abs(full.angle - 55 * DEG)).toBeGreaterThan(0.02); // moved to the ideal one
  });

  it('standing still, it comes back a little ahead of where he faces', () => {
    const p = createPlayer(0, -2, -3, 0);
    const ball = createBall(-1.4, -3.2);
    const plan = createWallPlan();
    expect(planWallPass(p, ball, 60 * DEG, false, 0.7, 1, 12, 30, TUNING, plan)).toBe(true);
    expect(plan.meetX).toBeGreaterThan(p.x + 1);
    expect(Math.abs(plan.meetY - p.y)).toBeLessThan(1);
  });
});

describe('wall pass in the world', () => {
  it('goes to the board and comes back to the passer: he keeps the control and the ball ends on his stick', () => {
    const t = tuningWith(() => {});
    const w = skating(3, t);
    tapAt(w, 55, t);
    expect(w.wallFrom).toBe(0);
    expect(w.passTo).toBe(-1);
    expect(w.controlled).toBe(0);
    let backTick = -1;
    let got = false;
    for (let i = 0; i < 360 && !got; i++) {
      step(w, cmd(1, 0), t);
      if (backTick < 0 && w.wallBack === 0) {
        backTick = w.tick;
        expect(w.passTo).toBe(0);
        expect(w.wallFrom).toBe(-1);
      }
      expect(w.controlled).toBe(0);
      got = w.ball.owner === 0;
    }
    expect(backTick).toBeGreaterThan(0);
    expect(got).toBe(true);
    expect(w.wallBack).toBe(-1);
    expect(w.passTo).toBe(-1);
  });

  it('with the assist on, most wall passes come back; with it off (same aim) almost none', () => {
    const rate = (level: 'off' | 'light' | 'strong'): number => {
      let ok = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const t = tuningWith(() => {});
        const w = skating(seed, t, level);
        tapAt(w, 55, t);
        for (let i = 0; i < 300 && w.ball.owner !== 0; i++) step(w, cmd(1, 0), t);
        if (w.ball.owner === 0) ok++;
      }
      return ok / 30;
    };
    expect(rate('strong')).toBeGreaterThan(0.6);
    expect(rate('light')).toBeGreaterThan(0.5);
    expect(rate('off')).toBeLessThan(0.35);
  });

  it('a teammate in the cone gets the pass instead; lofted passes are never wall passes', () => {
    const t = tuningWith(() => {});
    const w = skating(5, t);
    const mate = w.players[1]!;
    mate.x = mate.prevX = w.players[0]!.x + 6;
    mate.y = mate.prevY = 6;
    tapAt(w, Math.atan2(mate.y - w.players[0]!.y, mate.x - w.players[0]!.x) / DEG, t);
    expect(w.wallFrom).toBe(-1);
    const w2 = skating(5, t);
    const a = 55 * DEG;
    step(w2, cmd(Math.cos(a), Math.sin(a), { pass: true, passHeight: 1 }), t);
    expect(w2.wallFrom).toBe(-1);
  });

  it('no automatic switch to a teammate nearer the ball while a wall pass travels to the board', () => {
    const setup = (wall: boolean): WorldState => {
      const t = tuningWith(() => {});
      const w = createWorld(7, 2);
      // Ball loose and still near teammate 1, far from the controlled player.
      w.players[0]!.x = w.players[0]!.prevX = -10;
      w.players[0]!.y = w.players[0]!.prevY = 0;
      w.players[1]!.x = w.players[1]!.prevX = 8;
      w.players[1]!.y = w.players[1]!.prevY = 3;
      w.players[2]!.x = w.players[2]!.prevX = 8;
      w.players[2]!.y = w.players[2]!.prevY = -8;
      w.ball.owner = -1;
      w.ball.x = w.ball.prevX = 9;
      w.ball.y = w.ball.prevY = 3;
      w.ball.vx = w.ball.vy = 0;
      if (wall) w.wallFrom = 0;
      for (let i = 0; i < 60; i++) step(w, cmd(), t);
      return w;
    };
    expect(setup(false).controlled).toBe(1); // the usual automatic switch
    expect(setup(true).controlled).toBe(0); // not during a wall pass
  });

  it('is deterministic', () => {
    const run = (): number[] => {
      const t = tuningWith(() => {});
      const w = skating(9, t);
      tapAt(w, 55, t);
      for (let i = 0; i < 200; i++) step(w, cmd(1, 0), t);
      return [w.ball.x, w.ball.y, w.tick, w.ball.owner];
    };
    expect(run()).toEqual(run());
  });
});
