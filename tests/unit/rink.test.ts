import { describe, expect, it } from 'vitest';
import { goalLineX, RINK } from '../../src/config/rink';
import { boardSignedDistance, collideBoards, collideBox, goalFootprints, type Contact } from '../../src/sim/rink';

const n = { nx: 0, ny: 0 };
const c = (): Contact => ({ depth: 0, nx: 0, ny: 0 });

describe('rink geometry', () => {
  it('matches the reference measurements', () => {
    expect(RINK.length).toBe(40);
    expect(RINK.width).toBe(20);
    expect(RINK.goalWidth).toBeCloseTo(1.7);
    expect(RINK.goalHeight).toBeCloseTo(1.05);
    expect(goalLineX(1)).toBeCloseTo(17.2);
    expect(RINK.penaltySpotDistance).toBeCloseTo(5.4);
    expect(RINK.directFreeHitDistance).toBeCloseTo(7.4);
  });

  it('signed distance: negative inside, zero on boards, positive outside', () => {
    expect(boardSignedDistance(0, 0, n)).toBeCloseTo(-10);
    expect(boardSignedDistance(20, 0, n)).toBeCloseTo(0);
    expect(n).toEqual({ nx: 1, ny: 0 });
    expect(boardSignedDistance(0, -10, n)).toBeCloseTo(0);
    expect(n).toEqual({ nx: 0, ny: -1 });
    expect(boardSignedDistance(0, 11, n)).toBeCloseTo(1);
  });

  it('corners are rounded: the exact rectangle corner is outside', () => {
    expect(boardSignedDistance(19.95, 9.95, n)).toBeGreaterThan(0);
    // Point on the arc at 45°.
    const r = RINK.cornerRadius;
    const cx = 20 - r + r * Math.SQRT1_2;
    const cy = 10 - r + r * Math.SQRT1_2;
    expect(boardSignedDistance(cx, cy, n)).toBeCloseTo(0);
    expect(n.nx).toBeCloseTo(Math.SQRT1_2);
  });

  it('circle vs boards pushes back inside', () => {
    const out = c();
    expect(collideBoards(0, 0, 0.35, out)).toBe(false);
    expect(collideBoards(19.8, 0, 0.35, out)).toBe(true);
    expect(out.depth).toBeCloseTo(0.15);
    expect(out.nx).toBe(-1);
  });

  it('goal cages are solid, sit behind the goal line, and leave room to play behind them', () => {
    const [left, right] = goalFootprints();
    expect(right.minX).toBeCloseTo(17.2);
    expect(right.maxX).toBeCloseTo(17.2 + RINK.goalDepthBottom);
    expect(20 - right.maxX).toBeGreaterThan(1.5); // space to skate behind the goal
    expect(left.maxX).toBeCloseTo(-17.2);
    const out = c();
    expect(collideBox(17.0, 0, 0.35, right, out)).toBe(true);
    expect(out.nx).toBe(-1);
    expect(collideBox(16.0, 0, 0.35, right, out)).toBe(false);
    // Centre inside the cage → pushed out through the nearest face.
    expect(collideBox(17.3, 0, 0.35, right, out)).toBe(true);
    expect(out.nx).toBe(-1);
  });
});
