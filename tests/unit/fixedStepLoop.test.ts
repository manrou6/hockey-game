import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/game/fixedStepLoop';

describe('FixedStepLoop', () => {
  it('runs exactly one step per 1/60 s frame', () => {
    const loop = new FixedStepLoop(60, 5);
    let steps = 0;
    for (let i = 0; i < 600; i++) loop.advance(1 / 60, () => steps++);
    expect(steps).toBe(600);
  });
  it('runs 60 steps per simulated second at 120 Hz and 30 Hz displays', () => {
    for (const hz of [120, 90, 30]) {
      const loop = new FixedStepLoop(60, 5);
      let steps = 0;
      for (let i = 0; i < hz * 10; i++) loop.advance(1 / hz, () => steps++);
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
    }
  });
  it('exposes interpolation alpha in [0,1)', () => {
    const loop = new FixedStepLoop(60, 5);
    loop.advance(1 / 120, () => {});
    expect(loop.alpha).toBeCloseTo(0.5, 5);
    expect(loop.lastSteps).toBe(0);
  });
  it('clamps long pauses to maxStepsPerFrame', () => {
    const loop = new FixedStepLoop(60, 5);
    let steps = 0;
    loop.advance(3, () => steps++);
    expect(steps).toBe(5);
  });
});
