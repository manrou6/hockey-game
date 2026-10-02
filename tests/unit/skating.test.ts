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

/** Run while keeping the skater in mid-rink (so long runs at high speed never reach the boards). */
function runInPlace(p: PlayerState, c: PlayerCommand, seconds: number, each?: (p: PlayerState) => void): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    stepPlayer(p, c, TUNING, DT);
    p.x = 0;
    p.y = 0;
    each?.(p);
  }
}

/** Run `fn` with the trencada disabled (tests of plain turning physics). */
function withoutCut(fn: () => void): void {
  const saved = TUNING.cut.minSpeed;
  TUNING.cut.minSpeed = 1e9;
  try {
    fn();
  } finally {
    TUNING.cut.minSpeed = saved;
  }
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
    runInPlace(p, cmd(1, 0), 3);
    expect(speed(p)).toBeCloseTo(K.maxSpeed, 5);
    runInPlace(p, cmd(1, 0, true), 4);
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
    runInPlace(p, cmd(1, 0, true), 4);
    const v0 = speed(p);
    stepPlayer(p, cmd(1, 0), TUNING, DT);
    expect(v0 - speed(p)).toBeLessThanOrEqual(K.overspeedDecel * DT + 1e-6); // gradual
    runInPlace(p, cmd(1, 0), 2);
    expect(speed(p)).toBeCloseTo(K.maxSpeed, 3);
  });
});

describe('skating: glide and four-wheel skid stop', () => {
  it('bringing the stick back gently glides smoothly (no skid, never stops dead)', () => {
    const p = cruising();
    let prev = speed(p);
    for (let i = 0; i < 30; i++) {
      stepPlayer(p, cmd(1 - i / 30, 0), TUNING, DT);
      expect(prev - speed(p)).toBeLessThan(0.5);
      prev = speed(p);
    }
    runInPlace(p, cmd(0, 0), 0.2, (q) => {
      expect(q.skidTime).toBe(0);
      expect(prev - speed(q)).toBeLessThan(0.5);
      prev = speed(q);
    });
    runInPlace(p, cmd(0, 0), 15);
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
  it('turns more slowly at high speed (radius grows with speed)', () =>
    withoutCut(() => {
      const fast = cruising();
      const slow = createPlayer(0, 0, 0, 0);
      run(slow, cmd(0.4, 0), 3);
      slow.x = 0;
      const turnFor = (p: PlayerState): number => {
        const h0 = p.heading;
        run(p, cmd(0, 1, false), 0.2);
        return Math.abs(p.heading - h0);
      };
      expect(turnFor(fast)).toBeLessThan(turnFor(slow));
    }));
  it('a tight turn at full speed costs speed', () =>
    withoutCut(() => {
      const p = cruising();
      run(p, cmd(0, 1), 0.5);
      expect(speed(p)).toBeLessThan(K.maxSpeed * 0.95);
    }));
  it('a gentle curve costs much less speed than a tight turn', () =>
    withoutCut(() => {
      const gentle = cruising();
      const tight = cruising();
      const a = 0.15;
      run(gentle, cmd(Math.cos(a), Math.sin(a)), 0.5);
      run(tight, cmd(0, 1), 0.5);
      expect(K.maxSpeed - speed(gentle)).toBeLessThan(0.4 * (K.maxSpeed - speed(tight)));
    }));
  it('pivots on the spot when (almost) still', () => {
    const p = createPlayer(0, 0, 0, 0);
    run(p, cmd(-1, 0), 0.5);
    expect(Math.abs(Math.abs(p.heading) - Math.PI)).toBeLessThan(0.05);
    expect(p.vx).toBeLessThan(0);
  });
});

describe('skating: trencada (lateral cut)', () => {
  const C = TUNING.cut;
  /** Flick the stick 90° to the left while cruising along +x. */
  function flick(sprint = false): PlayerState {
    const p = cruising();
    stepPlayer(p, cmd(0, 1, sprint), TUNING, DT);
    return p;
  }

  it('a quick 90° flick at speed starts a trencada (pre-brake first)', () => {
    const p = flick();
    expect(p.cutPrep).toBeGreaterThan(0);
    expect(p.braking).toBe(true);
  });

  it('first a pre-brake along the old direction, then the turn: exits at `redirect` of the old speed with a soft push', () => {
    const p = flick();
    const v0 = p.cutSpeed0;
    // Pre-brake: keeps going the old way (+x), losing speed; the body starts turning.
    let maxBody = 0;
    runInPlace(p, cmd(0, 1), C.prepTime - DT, (q) => {
      expect(Math.abs(q.vy)).toBeLessThan(1e-6);
      maxBody = Math.max(maxBody, Math.abs(wrapAngleTest(q.heading - Math.atan2(q.vy, q.vx))));
    });
    expect(p.cutPrep).toBe(0);
    expect(speed(p)).toBeCloseTo(v0 * (1 - C.prepSpeedLoss), 1);
    expect(maxBody).toBeGreaterThan(C.bodyTurn * 0.8);
    // The turn itself.
    runInPlace(p, cmd(0, 1), C.duration);
    expect(p.cutTime).toBe(0);
    expect(Math.abs(p.vx)).toBeLessThan(0.05);
    expect(p.vy).toBeCloseTo(v0 * C.redirect, 1);
    expect(p.vy).toBeLessThan(K.maxSpeed * 0.5); // a defendable exit
    // Soft exit push: a bit faster than plain acceleration, but no sprint.
    const vEnd = speed(p);
    runInPlace(p, cmd(0, 1), 0.2);
    const withPush = speed(p) - vEnd;
    const plain = cruising();
    plain.vx = 0;
    plain.vy = vEnd;
    plain.heading = Math.PI / 2;
    plain.boostCooldown = 99;
    plain.cutCooldown = 99;
    runInPlace(plain, cmd(0, 1), 0.2);
    expect(withPush).toBeGreaterThan(speed(plain) - vEnd + 0.5);
  });

  it('after the cut you must re-accelerate: no sprint for noSprintTime even with the thumb in the ring', () => {
    const p = flick(true);
    runInPlace(p, cmd(0, 1, true), C.prepTime + C.duration);
    expect(p.cutRecovery).toBeGreaterThan(0);
    let peak = 0;
    runInPlace(p, cmd(0, 1, true), C.noSprintTime - 2 * DT, (q) => (peak = Math.max(peak, speed(q))));
    expect(peak).toBeLessThanOrEqual(K.maxSpeed + 1e-6);
    runInPlace(p, cmd(0, 1, true), 6);
    expect(speed(p)).toBeCloseTo(K.sprintSpeed, 3); // the sprint comes back later
  });

  it('a normal curve (stick turning gradually) never triggers a cut', () => {
    const p = cruising();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * (Math.PI / 2); // 90° over 1 s
      stepPlayer(p, cmd(Math.cos(a), Math.sin(a)), TUNING, DT);
      p.x = 0;
      p.y = 0;
      expect(p.cutTime + p.cutPrep).toBe(0);
    }
  });

  it('no cut below the minimum speed or beyond the brake angle (that is the skid stop)', () => {
    const slow = createPlayer(0, 0, 4, 0);
    run(slow, cmd(0.4, 0), 2);
    expect(speed(slow)).toBeLessThan(C.minSpeed);
    stepPlayer(slow, cmd(0, 1), TUNING, DT);
    expect(slow.cutPrep).toBe(0);
    const rev = cruising();
    stepPlayer(rev, cmd(-1, 0.1), TUNING, DT);
    expect(rev.cutPrep).toBe(0);
    expect(rev.skidTime).toBeGreaterThan(0);
  });

  it('taking the stick back to the old direction cancels it (also during the pre-brake)', () => {
    const p = flick();
    runInPlace(p, cmd(0, 1), C.prepTime / 2);
    expect(p.cutPrep).toBeGreaterThan(0);
    stepPlayer(p, cmd(1, 0), TUNING, DT);
    expect(p.cutPrep).toBe(0);
    expect(p.cutTime).toBe(0);
  });

  it('cannot be chained: cooldown counts from the end of the manoeuvre, and the exit push blocks the sprint push', () => {
    const p = flick();
    runInPlace(p, cmd(0, 1), C.prepTime + C.duration);
    expect(p.cutTime).toBe(0);
    expect(p.cutCooldown).toBeGreaterThan(C.cooldown - 2 * DT); // started at the end of the manoeuvre
    expect(p.boostTime).toBeGreaterThan(0); // exit push running
    // Flick back at once: no new cut (only plain turning).
    stepPlayer(p, cmd(1, 0), TUNING, DT);
    expect(p.cutPrep + p.cutTime).toBe(0);
    // Entering a sprint after the recovery gives no extra sprint push (shared cooldown).
    const q = flick();
    runInPlace(q, cmd(0, 1), C.prepTime + C.duration + C.noSprintTime);
    runInPlace(q, cmd(0, 1, true), DT);
    expect(q.boostIsSprint).toBe(false);
  });

  it('"only with sprint" (option B): no cut without the sprint zone, cut with it', () => {
    const saved = C.onlyWithSprint;
    C.onlyWithSprint = 1;
    try {
      expect(flick(false).cutPrep).toBe(0);
      expect(flick(true).cutPrep).toBeGreaterThan(0);
    } finally {
      C.onlyWithSprint = saved;
    }
  });
});

function wrapAngleTest(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

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
