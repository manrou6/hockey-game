import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import { ballParams } from '../../src/sim/ball';
import { BASE, HEAVY, runRebound, type Target } from './bench/reboundBench';

// F1.5c: rebounds off the goal frame, the net and the boards at shot speeds (docs/03 §2).

const TARGETS: [Target, number, number][] = [
  ['post', 8, 0],
  ['post', 8, 30],
  ['bar', 8, 0],
  ['sideNet', 5, 75],
  ['topNet', 6, 0],
  ['endBoards', 12, 0],
  ['corner', 15, 30],
];

describe('rebounds at shot speeds (F1.5c)', () => {
  it('nothing goes through the posts, the bar or the net, up to 30 m/s (normal and heavy ball)', () => {
    for (const t of [BASE(), HEAVY()]) {
      for (const [target, dist, angle] of TARGETS) {
        for (const speed of [20, 28, 30]) {
          const s = runRebound(t, { target, dist, angle, speed }, 21);
          expect(s.tunnel).toBe(0);
          expect(s.hit).toBeGreaterThan(50);
          // A rebound never comes off faster than it went in.
          expect(s.reboundSpeed).toBeLessThan(s.launchSpeed);
        }
      }
    }
  });
  it('the heavy ball is off by factory; on, it comes off the boards and the frame slower', () => {
    expect(TUNING.ball.heavy).toBe(0);
    expect(ballParams(TUNING)).toBe(TUNING.ball);
    const heavy = HEAVY();
    expect(ballParams(heavy).boardRestitution).toBe(heavy.ball.heavyBoardRestitution);
    for (const [target, dist, angle] of [['endBoards', 12, 0], ['post', 8, 30], ['corner', 15, 30]] as const) {
      const n = runRebound(BASE(), { target, dist, angle, speed: 28 }, 21);
      const h = runRebound(heavy, { target, dist, angle, speed: 28 }, 21);
      expect(h.reboundSpeed).toBeLessThan(n.reboundSpeed);
    }
  });
  it('is deterministic', () => {
    const a = runRebound(BASE(), { target: 'corner', dist: 15, angle: 30, speed: 28 }, 11);
    const b = runRebound(BASE(), { target: 'corner', dist: 15, angle: 30, speed: 28 }, 11);
    expect(a).toEqual(b);
  });
});
