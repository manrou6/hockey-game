import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import { dragHeight } from '../../src/input/passGesture';

const D = TUNING.input.passDragDistance;
const A = TUNING.input.passDragAngle;
const deg = (d: number): number => (d * Math.PI) / 180;
/** A drag of `len` px leaning `lean`° from straight up, to the right (+) or left (−). */
const drag = (len: number, lean: number): number => dragHeight(Math.sin(deg(lean)) * len, Math.cos(deg(lean)) * len, D, A);

describe('PASE height gesture (diagonal drag)', () => {
  it('no drag, or a short one, is a low pass', () => {
    expect(dragHeight(0, 0, D, A)).toBe(0);
    expect(drag(D - 5, -45)).toBe(0);
    expect(drag(D - 5, 45)).toBe(0);
  });

  it('up-right = driven lofted (the common one), up-left = lob', () => {
    expect(drag(D + 5, 45)).toBe(1);
    expect(drag(D + 5, -45)).toBe(2);
  });

  it('a longer drag keeps the same height (the direction decides, not the length)', () => {
    expect(drag(D * 3, 45)).toBe(1);
    expect(drag(D * 3, -45)).toBe(2);
  });

  it('straight up (within the minimum lean), downward and flat sideways drags change nothing', () => {
    expect(drag(D * 2, 0)).toBe(0);
    expect(drag(D * 2, -(A * 180) / Math.PI + 1)).toBe(0);
    expect(drag(D * 2, -(A * 180) / Math.PI - 1)).toBe(2);
    expect(dragHeight(-D * 2, -D, D, A)).toBe(0);
    expect(dragHeight(-D * 2, 0, D, A)).toBe(0);
    expect(dragHeight(D * 2, 2, D, A)).toBe(0);
  });

  it('is easy: a 25° to 80° lean up either way counts, at the default distance', () => {
    for (const lean of [25, 35, 45, 60, 75, 80]) {
      expect(drag(D + 5, lean)).toBe(1);
      expect(drag(D + 5, -lean)).toBe(2);
    }
  });

  it('the threshold and the angle come from the tuning (panel)', () => {
    expect(dragHeight(-30, 30, 60, A)).toBe(0);
    expect(dragHeight(30, 30, 40, A)).toBe(1);
    expect(dragHeight(-10, 60, 40, deg(20))).toBe(0);
    expect(dragHeight(10, 60, 40, deg(5))).toBe(1);
  });
});
