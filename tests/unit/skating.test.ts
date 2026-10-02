import { beforeEach, describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import type { PlayerCommand } from '../../src/sim/commands';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from '../../src/sim/player';
import { boardSignedDistance, goalFootprints } from '../../src/sim/rink';
import { createRng, nextFloat } from '../../src/sim/rng';

const DT = 1 / TUNING.sim.tickRate;
const K = TUNING.skating;
const speed = (p: PlayerState): number => Math.hypot(p.vx, p.vy);
const cmd = (moveX: number, moveY: number, sprint = false): PlayerCommand => ({ moveX, moveY, sprint });

function run(p: PlayerState, c: PlayerCommand, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) stepPlayer(p, c, TUNING, DT);
}

/** Seconds until `cond` holds (or Infinity). */
function timeUntil(p: PlayerState, c: PlayerCommand, cond: (p: PlayerState) => boolean, max = 10): number {
  for (let t = 0; t < max; t += DT) {
    if (cond(p)) return t;
    stepPlayer(p, c, TUNING, DT);
  }
  return Infinity;
}

/** A player already cruising along +x at top speed, at rink centre. */
function cruising(): PlayerState {
  const p = createPlayer(0, -10, 0, 0);
  run(p, cmd(1, 0), 4);
  p.x = 0;
  p.y = 0;
  return p;
}

describe('skating: acceleration', () => {
  let p: PlayerState;
  beforeEach(() => {
    p = createPlayer(0, -12, 0, 0);
  });
  it('reaches 7 m/s in ~1.8 s from standstill', () => {
    const t = timeUntil(p, cmd(1, 0), (q) => speed(q) >= 7);
    expect(t).toBeGreaterThan(1.5);
    expect(t).toBeLessThan(2.1);
  });
  it('has a strong start (non-linear curve)', () => {
    run(p, cmd(1, 0), 0.5);
    expect(speed(p)).toBeGreaterThan(3); // > 40% of 7 m/s in the first 28% of the time
  });
  it('caps at maxSpeed without sprint and sprintSpeed with sprint', () => {
    run(p, cmd(1, 0), 3);
    expect(speed(p)).toBeCloseTo(K.maxSpeed, 5);
    p.x = -12;
    run(p, cmd(1, 0, true), 3);
    expect(speed(p)).toBeCloseTo(K.sprintSpeed, 5);
  });
  it('a half-pushed stick gives a lower cruising speed', () => {
    run(p, cmd(0.5, 0), 3);
    expect(speed(p)).toBeGreaterThan(2.5);
    expect(speed(p)).toBeLessThan(K.maxSpeed * 0.6);
  });
});

describe('skating: glide and brake', () => {
  it('glides smoothly when the stick is released (never stops dead)', () => {
    const p = cruising();
    const v0 = speed(p);
    stepPlayer(p, cmd(0, 0), TUNING, DT);
    expect(v0 - speed(p)).toBeLessThan(0.1); // no sudden drop on release
    p.x = -15;
    run(p, cmd(0, 0), 1);
    expect(speed(p)).toBeGreaterThan(5);
    p.x = -15;
    run(p, cmd(0, 0), 15);
    expect(speed(p)).toBe(0);
  });
  it('T-stop: pulling the stick back stops from top speed in ~0.6 s', () => {
    const p = cruising();
    // Forward motion is gone once vx drops to ~0 (then the skater pivots and pushes back).
    const t = timeUntil(p, cmd(-1, 0), (q) => q.vx < 0.3);
    expect(t).toBeGreaterThan(0.45);
    expect(t).toBeLessThan(0.75);
  });
  it('flags braking while doing the T-stop', () => {
    const p = cruising();
    stepPlayer(p, cmd(-1, 0), TUNING, DT);
    expect(p.braking).toBe(true);
  });
});

describe('skating: turning', () => {
  it('turns more slowly at high speed (radius grows with speed)', () => {
    const fast = cruising();
    const slow = createPlayer(0, 0, 0, 0);
    run(slow, cmd(0.35, 0), 3);
    slow.x = 0;
    const turnFor = (p: PlayerState): number => {
      const h0 = p.heading;
      run(p, cmd(0, 1, false), 0.2);
      return Math.abs(p.heading - h0);
    };
    expect(turnFor(fast)).toBeLessThan(turnFor(slow));
  });
  it('a tight turn at full speed costs speed', () => {
    const p = cruising();
    run(p, cmd(0, 1), 0.5);
    expect(speed(p)).toBeLessThan(K.maxSpeed * 0.95);
  });
  it('a gentle curve keeps almost all speed', () => {
    const p = cruising();
    const a = 0.25;
    run(p, cmd(Math.cos(a), Math.sin(a)), 0.5);
    expect(speed(p)).toBeGreaterThan(K.maxSpeed * 0.97);
  });
  it('pivots on the spot when (almost) still', () => {
    const p = createPlayer(0, 0, 0, 0);
    run(p, cmd(-1, 0), 0.5);
    expect(Math.abs(Math.abs(p.heading) - Math.PI)).toBeLessThan(0.05);
    expect(p.vx).toBeLessThan(0);
  });
});

describe('skating: never through boards, goals or players', () => {
  it('random sprinting for 2 minutes always stays inside and out of the goals', () => {
    const r = createRng(2024);
    const p = createPlayer(0, 0, 0, 0);
    const n = { nx: 0, ny: 0 };
    const goals = goalFootprints();
    let c = cmd(1, 0, true);
    for (let i = 0; i < 60 * 120; i++) {
      if (i % 45 === 0) {
        const a = nextFloat(r) * Math.PI * 2;
        c = cmd(Math.cos(a), Math.sin(a), nextFloat(r) > 0.3);
      }
      stepPlayer(p, c, TUNING, DT);
      expect(boardSignedDistance(p.x, p.y, n)).toBeLessThanOrEqual(-K.radius + 1e-6);
      for (const g of goals) {
        const inside = p.x > g.minX && p.x < g.maxX && p.y > g.minY && p.y < g.maxY;
        expect(inside).toBe(false);
      }
    }
  });
  it('bounces softly off the boards and keeps sliding along them', () => {
    const p = createPlayer(0, 0, 8, 0);
    // Skate diagonally into the far side board.
    run(p, cmd(Math.SQRT1_2, Math.SQRT1_2, true), 2.5);
    expect(p.y).toBeLessThanOrEqual(10 - K.radius + 1e-6);
    expect(Math.abs(p.vx)).toBeGreaterThan(2); // still moving along the board
  });
  it('two players never overlap after colliding', () => {
    const a = createPlayer(0, -2, 0, 0);
    const b = createPlayer(1, 2, 0, Math.PI);
    for (let i = 0; i < 120; i++) {
      stepPlayer(a, cmd(1, 0, true), TUNING, DT);
      stepPlayer(b, cmd(-1, 0, true), TUNING, DT);
      collidePlayers(a, b, TUNING);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(K.radius * 2 - 1e-6);
    }
  });
});
