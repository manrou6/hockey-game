import { describe, expect, it } from 'vitest';
import { smoothDamp } from '../../src/render/smoothing';

describe('smoothDamp', () => {
  it('converges to the target without overshoot', () => {
    const s = { value: 0, v: 0 };
    let maxSeen = 0;
    for (let i = 0; i < 300; i++) maxSeen = Math.max(maxSeen, smoothDamp(s, 10, 0.3, 1 / 60));
    expect(s.value).toBeCloseTo(10, 3);
    expect(maxSeen).toBeLessThanOrEqual(10);
  });
  it('is roughly frame-rate independent', () => {
    const a = { value: 0, v: 0 };
    const b = { value: 0, v: 0 };
    for (let i = 0; i < 30; i++) smoothDamp(a, 10, 0.3, 1 / 60);
    for (let i = 0; i < 60; i++) smoothDamp(b, 10, 0.3, 1 / 120);
    expect(Math.abs(a.value - b.value)).toBeLessThan(0.05);
  });
});
