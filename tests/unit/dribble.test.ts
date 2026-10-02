import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import type { PlayerCommand } from '../../src/sim/commands';
import { bladePoint, targetSeparation } from '../../src/sim/dribble';
import { createPlayer } from '../../src/sim/player';
import { boardSignedDistance } from '../../src/sim/rink';
import { createRng, nextFloat } from '../../src/sim/rng';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';
import { placeBall } from '../../src/sim/ball';

const cmd = (moveX: number, moveY: number, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({
  moveX, moveY, sprint: false, pass: false, shoot: false, dribble: false, ...extra,
});

/** World with player 0 at (x,y) facing +x and the ball already on its stick. */
function carrying(x = -10, y = 0): WorldState {
  const w = createWorld(1);
  const p = w.players[0]!;
  p.x = p.prevX = x;
  p.y = p.prevY = y;
  p.heading = 0;
  const b = bladePoint(p, TUNING);
  placeBall(w.ball, b.x, b.y);
  stepWorld(w, [cmd(0, 0)], TUNING);
  expect(w.ball.owner).toBe(0);
  return w;
}

function run(w: WorldState, c: PlayerCommand | ((i: number) => PlayerCommand), ticks: number, each?: (w: WorldState) => void): void {
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, [typeof c === 'function' ? c(i) : c], TUNING);
    each?.(w);
  }
}

/** Distance between the ball and the blade point. */
const offBlade = (w: WorldState): number => {
  const b = bladePoint(w.players[0]!, TUNING);
  return Math.hypot(w.ball.x - b.x, w.ball.y - b.y);
};

describe('dribbling: taking the ball', () => {
  it('skating onto a loose ball puts it on the stick', () => {
    const w = createWorld(1);
    placeBall(w.ball, -2.5, -TUNING.dribble.stickSide);
    run(w, cmd(1, 0), 60);
    expect(w.ball.owner).toBe(0);
  });

  it('a ball arriving too fast is not controlled', () => {
    const w = createWorld(1);
    const p = w.players[0]!;
    placeBall(w.ball, p.x + 6, p.y - TUNING.dribble.stickSide);
    w.ball.vx = -25;
    run(w, cmd(0, 0), 30);
    expect(w.ball.owner).toBe(-1);
  });
});

describe('dribbling: feel at normal speed', () => {
  it('stays glued to the blade with very little wobble and is never lost', () => {
    const w = carrying(-15, 0);
    let maxOff = 0;
    // Skate straight at normal top speed, then gentle, continuous curves (±30°), for 4 s.
    run(w, (i) => {
      const a = i < 120 ? 0 : 0.5 * Math.sin((i - 120) / 45);
      return cmd(Math.cos(a), Math.sin(a));
    }, 240, (ww) => {
      expect(ww.ball.owner).toBe(0);
      if (ww.tick > 30) maxOff = Math.max(maxOff, offBlade(ww));
    });
    expect(maxOff).toBeLessThan(0.06);
  });

  it('sprinting separates the ball more than normal speed', () => {
    const normal = carrying(-16, 0);
    const sprint = carrying(-16, 0);
    let maxNormal = 0;
    let maxSprint = 0;
    run(normal, cmd(1, 0), 180, (w) => (maxNormal = Math.max(maxNormal, offBlade(w))));
    run(sprint, cmd(1, 0, { sprint: true }), 180, (w) => (maxSprint = Math.max(maxSprint, offBlade(w))));
    expect(maxSprint).toBeGreaterThan(maxNormal + 0.1);
  });

  it('a tight turn at speed and opponent pressure raise the separation; Control lowers it', () => {
    const p = createPlayer(0, 0, 0, 0);
    p.vx = TUNING.skating.maxSpeed;
    const straight = targetSeparation(p, 0, TUNING);
    p.turnLock = 1;
    const turning = targetSeparation(p, 0, TUNING);
    expect(turning).toBeGreaterThan(straight + 0.1);
    p.turnLock = 0;
    expect(targetSeparation(p, 1, TUNING)).toBeGreaterThan(straight + 0.1);
    p.control = 99;
    const good = targetSeparation(p, 1, TUNING);
    p.control = 30;
    const poor = targetSeparation(p, 1, TUNING);
    expect(good).toBeLessThan(poor);
  });

  it('a real opponent nearby makes the ball separate more', () => {
    const alone = carrying(-14, 0);
    const pressed = carrying(-14, 0);
    const rival = createPlayer(1, 0, 0, Math.PI);
    rival.team = 1;
    pressed.players.push(rival);
    let maxAlone = 0;
    let maxPressed = 0;
    // The rival skates alongside (no contact) at the same speed.
    run(alone, cmd(1, 0), 120, (w) => (maxAlone = Math.max(maxAlone, w.ball.separation)));
    for (let i = 0; i < 120; i++) {
      const c = pressed.players[0]!;
      rival.x = rival.prevX = c.x;
      rival.y = rival.prevY = c.y + 1.0;
      stepWorld(pressed, [cmd(1, 0), cmd(0, 0)], TUNING);
      maxPressed = Math.max(maxPressed, pressed.ball.separation);
    }
    expect(maxPressed).toBeGreaterThan(maxAlone + 0.1);
  });
});

describe('dribbling: skid stop', () => {
  it('a skid stop at speed makes the ball run on ahead of the stick', () => {
    const w = carrying(-18, 3);
    run(w, cmd(1, 0), 150);
    const before = w.ball.separation;
    let maxSep = 0;
    run(w, cmd(-1, 0), 20, (ww) => (maxSep = Math.max(maxSep, ww.ball.separation)));
    expect(maxSep).toBeGreaterThan(before + 0.12);
  });
});

describe('dribbling: losing the ball', () => {
  it('normal-speed slaloms for a minute never lose the ball', () => {
    const w = carrying(0, 0);
    const r = createRng(9);
    let c = cmd(1, 0);
    for (let i = 0; i < 3600; i++) {
      if (i % 50 === 0) {
        const a = nextFloat(r) * Math.PI * 2;
        c = cmd(Math.cos(a) * 0.9, Math.sin(a) * 0.9);
      }
      stepWorld(w, [c], TUNING);
      expect(w.ball.owner).toBe(0);
    }
  });

  it('a straight sprint alone never loses it', () => {
    const w = carrying(-18, 3);
    run(w, cmd(1, 0, { sprint: true }), 240, (ww) => {
      if (ww.players[0]!.x < 14) expect(ww.ball.owner).toBe(0);
    });
  });

  it('sprinting with a rival pressing alongside can lose it', () => {
    let lost = 0;
    for (let seed = 0; seed < 10; seed++) {
      const w = carrying(-18, 3);
      w.rng = createRng(seed);
      const rival = createPlayer(1, 0, 0, 0);
      rival.team = 1;
      w.players.push(rival);
      for (let i = 0; i < 240 && w.ball.owner === 0; i++) {
        const c = w.players[0]!;
        rival.x = rival.prevX = c.x;
        rival.y = rival.prevY = c.y + 0.75;
        stepWorld(w, [cmd(1, 0, { sprint: true }), cmd(0, 0)], TUNING);
      }
      if (w.ball.owner !== 0) lost++;
    }
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThan(10);
  });

  it('keeps the ball inside the boards when carrying it along them', () => {
    const w = carrying(-10, 9);
    const n = { nx: 0, ny: 0 };
    run(w, cmd(0.7, 0.7), 240, (ww) => {
      expect(boardSignedDistance(ww.ball.x, ww.ball.y, n)).toBeLessThanOrEqual(1e-6);
    });
  });
});

describe('dribbling: buttons (provisional pass/shot) and the 150 ms buffer', () => {
  it('TIRO shoots towards the attacked goal and the shooter cannot retake it at once', () => {
    const w = carrying(5, 2);
    run(w, cmd(1, 0, { shoot: true }), 1);
    expect(w.ball.owner).toBe(-1);
    expect(w.ball.vx).toBeGreaterThan(15);
    run(w, cmd(1, 0), 5);
    expect(w.ball.owner).toBe(-1);
  });

  it('PASE sends the ball where the stick points', () => {
    const w = carrying(0, 0);
    run(w, cmd(0, 1, { pass: true }), 1);
    expect(w.ball.owner).toBe(-1);
    expect(w.ball.vy).toBeGreaterThan(8);
  });

  it('a press up to 150 ms before receiving still fires on reception; earlier ones do not', () => {
    for (const [early, fires] of [[6, true], [15, false]] as const) {
      const w = createWorld(1);
      const p = w.players[0]!;
      const b = bladePoint(p, TUNING);
      placeBall(w.ball, b.x + 1.2, b.y);
      w.ball.vx = -2; // rolling onto the stick
      // Find when it would arrive, then press `early` ticks before that.
      const probe = structuredClone(w);
      let arrive = 0;
      while (probe.ball.owner !== 0 && arrive < 120) {
        stepWorld(probe, [cmd(0, 0)], TUNING);
        arrive++;
      }
      expect(arrive).toBeGreaterThan(early);
      for (let i = 0; i < arrive + 2; i++) stepWorld(w, [cmd(0, 0, { pass: i === arrive - early })], TUNING);
      expect(w.ball.owner === -1 && Math.hypot(w.ball.vx, w.ball.vy) > 8, `early ${early}`).toBe(fires);
    }
  });
});

describe('dribbling into the goal', () => {
  it('carrying the ball over the goal line through the mouth scores', () => {
    const w = carrying(12, 0.14);
    let scored = false;
    run(w, cmd(1, 0), 240, (ww) => (scored ||= ww.events.some((e) => e.type === 'goal')));
    expect(scored).toBe(true);
    expect(w.ball.owner === -1 || w.ball.x === 0).toBe(true);
  });
});
