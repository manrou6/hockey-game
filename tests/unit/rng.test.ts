import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextUint32 } from '../../src/sim/rng';

describe('seeded RNG', () => {
  it('same seed → same sequence', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 1000; i++) expect(nextUint32(a)).toBe(nextUint32(b));
  });
  it('different seeds → different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 8 }, () => nextUint32(a));
    const seqB = Array.from({ length: 8 }, () => nextUint32(b));
    expect(seqA).not.toEqual(seqB);
  });
  it('floats are in [0,1) and roughly uniform', () => {
    const r = createRng(42);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const f = nextFloat(r);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
    }
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });
  it('state can be snapshotted and resumed', () => {
    const r = createRng(7);
    nextUint32(r);
    const snap = { ...r };
    const x = nextUint32(r);
    expect(nextUint32(snap)).toBe(x);
  });
});
