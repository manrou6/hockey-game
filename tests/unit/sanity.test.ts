import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';

describe('tuning', () => {
  it('runs the simulation at 60 Hz', () => {
    expect(TUNING.sim.tickRate).toBe(60);
  });
});
