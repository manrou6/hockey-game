import { beforeEach, describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import type { PlayerCommand } from '../../src/sim/commands';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from '../../src/sim/player';
import { boardSignedDistance, goalFootprints } from '../../src/sim/rink';
import { createRng, nextFloat } from '../../src/sim/rng';

const DT = 1 / TUNING.sim.tickRate;
const K = TUNING.skating;
const speed = (p: PlayerState): number => Math.hypot(p.vx, p.vy);
const cmd = (moveX: number, moveY: number, sprint = false): PlayerCommand => ({ moveX, moveY, sprint, pass: false, shoot: false, dribble: false });

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

/** A player already cruising along +x at the normal top speed, moved to rink centre. */
function cruising(): PlayerState {
  const p = createPlayer(0, -18, 4, 0);
  run(p, cmd(1, 0), 3);
  p.x = 0;
  p.y = 0;
  return p;
}

describe('skating: acceleration', () => {
  let p: PlayerState;
  beforeEach(() => {
    p = createPlayer(0, -18, 4, 0);
  });
  it('reaches 90% of the normal top speed in ~1.5 s from standstill', () => {
    const t = timeUntil(p, cmd(1, 0), (q) => speed(q) >= 0.9 * K.maxSpeed);
    expect(t).toBeGreaterThan(1.3);
    expect(t).toBeLessThan(1.9);
  });
  it('has a strong start (non-linear curve)', () => {
    run(p, cmd(1, 0), 0.5);
    expect(speed(p)).toBeGreaterThan(3);
  });
  it('caps at maxSpeed without sprint and sprintSpeed with sprint', () => {
    run(p, cmd(1, 0), 3);
    expect(speed(p)).toBeCloseTo(K.maxSpeed, 5);
    p.x = -18;
    run(p, cmd(1, 0, true), 3.2);
    expect(speed(p)).toBeCloseTo(K.sprintSpeed, 5);
  });
  it('a half-pushed stick gives a lower cruising speed', () => {
    run(p, cmd(0.5, 0), 3);
    expect(speed(p)).toBeGreaterThan(2.5);
    expect(speed(p)).toBeLessThan(K.maxSpeed * 0.6);
  });
});

describe('skating: sprint push', () => {
  it('entering a sprint gives a short push that briefly goes above the sprint top speed, then settles', () => {
    const p = cruising();
    let peak = 0;
    let after03 = 0;
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, cmd(1, 0, true), TUNING, DT);
      peak = Math.max(peak, speed(p));
      if (i === 17) after03 = speed(p);
      p.x = 0; // stay in the middle of the rink
    }
    // The push is noticeable: +~2 m/s in 0.3 s (normal acceleration alone is much slower near the cap).
    expect(after03 - K.maxSpeed).toBeGreaterThan(1.5);
    expect(peak).toBeGreaterThan(K.sprintSpeed);
    expect(peak).toBeLessThanOrEqual(K.sprintSpeed + K.sprintBoostOvershoot + 1e-6);
    expect(speed(p)).toBeCloseTo(K.sprintSpeed, 3);
  });
  it('no second push when flicking in and out of sprint (cooldown)', () => {
    const p = cruising();
    stepPlayer(p, cmd(1, 0, true), TUNING, DT);
    expect(p.boostTime).toBeGreaterThan(0);
    stepPlayer(p, cmd(1, 0, false), TUNING, DT);
    stepPlayer(p, cmd(1, 0, true), TUNING, DT);
    expect(p.boostTime).toBe(0);
  });
  it('leaving the sprint slows down naturally (not instantly) to the normal top speed', () => {
    const p = cruising();
    for (let i = 0; i < 150; i++) {
      stepPlayer(p, cmd(1, 0, true), TUNING, DT);
      p.x = 0;
    }
    const v0 = speed(p);
    stepPlayer(p, cmd(1, 0), TUNING, DT);
    expect(v0 - speed(p)).toBeLessThan(0.1);
    run(p, cmd(1, 0), 1.5);
    expect(speed(p)).toBeCloseTo(K.maxSpeed, 3);
  });
});

describe('skating: glide and four-wheel skid stop', () => {
  it('bringing the stick back gently glides smoothly (never stops dead)', () => {
    const p = cruising();
    for (let i = 0; i < 30; i++) stepPlayer(p, cmd(1 - i / 30, 0), TUNING, DT);
    p.x = -10;
    run(p, cmd(0, 0), 1);
    expect(speed(p)).toBeGreaterThan(5);
    expect(p.skidTime).toBe(0);
    p.x = -15;
    run(p, cmd(0, 0), 15);
    expect(speed(p)).toBe(0);
  });

  for (const [name, c] of [['stick reversed', cmd(-1, 0)], ['stick released abruptly', cmd(0, 0)]] as const) {
    it(`${name} at speed: skids on in the same direction and stops in ~0.4-0.6 s`, () => {
      const p = cruising();
      const v0 = speed(p);
      stepPlayer(p, c, TUNING, DT);
      expect(p.braking).toBe(true);
      expect(v0 - speed(p)).toBeLessThan(0.6); // not a dead stop
      let t = DT;
      let maxBodyTurn = 0;
      while (speed(p) > 0.3 && t < 2) {
        expect(p.vx).toBeGreaterThan(0); // still sliding the way it was going
        maxBodyTurn = Math.max(maxBodyTurn, Math.abs(p.heading));
        stepPlayer(p, c, TUNING, DT);
        t += DT;
      }
      expect(t).toBeGreaterThan(0.4);
      expect(t).toBeLessThan(0.65);
      // The body turns towards the skid side, then comes back.
      expect(maxBodyTurn).toBeGreaterThan(K.skidBodyTurn * 0.8);
    });
  }

  it('pushing forward again cancels the skid', () => {
    const p = cruising();
    stepPlayer(p, cmd(-1, 0), TUNING, DT);
    expect(p.skidTime).toBeGreaterThan(0);
    stepPlayer(p, cmd(1, 0), TUNING, DT);
    expect(p.skidTime).toBe(0);
    expect(speed(p)).toBeGreaterThan(K.maxSpeed * 0.9);
  });

  it('after the skid with the stick still reversed, the skater turns and goes the other way', () => {
    const p = cruising();
    run(p, cmd(-1, 0), 1.5);
    expect(p.vx).toBeLessThan(-1);
  });

  it('releasing the stick at low speed just glides (no skid)', () => {
    const p = createPlayer(0, 0, 4, 0);
    run(p, cmd(0.3, 0), 2);
    stepPlayer(p, cmd(0, 0), TUNING, DT);
    expect(p.skidTime).toBe(0);
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
