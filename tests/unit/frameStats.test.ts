import { describe, expect, it } from 'vitest';
import { FrameStats } from '../../src/game/frameStats';

describe('FrameStats', () => {
  it('computes average, p95, max and fps', () => {
    const s = new FrameStats(100);
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.average()).toBeCloseTo(50.5);
    expect(s.percentile(95)).toBe(95);
    expect(s.max()).toBe(100);
    expect(s.fps()).toBeCloseTo(1000 / 50.5);
  });
  it('keeps only the last N samples', () => {
    const s = new FrameStats(4);
    for (const v of [100, 100, 16, 16, 16, 16]) s.push(v);
    expect(s.average()).toBe(16);
    expect(s.size).toBe(4);
  });
});
