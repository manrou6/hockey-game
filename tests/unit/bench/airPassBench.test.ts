import { describe, it } from 'vitest';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { BINS, runAirSingles } from './airPassBench';

// Driven lofted pass and lob to a teammate, single passes by the REAL passer-receiver distance
// (F1.5e: the driven pass arrives in the air up to pass.driveAirFull; beyond, the v0.1.27 pass).
// The receiver gets the control as the pass leaves and the human leaves the stick alone; aiming
// error ±0.12 rad; Mitjana. has % / clean % and how each one ended (high = taken in the air).
// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench/airPassBench
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

run('air pass bench (F1.5e)', () => {
  it('single driven lofted passes and lobs by real distance: has / clean', { timeout: 900000 }, () => {
    const t: Tuning = structuredClone(TUNING);
    for (const height of [1, 2]) {
      const { has, clean, n, why } = runAirSingles(t, height);
      const cols = BINS.slice(0, -1).map((x, i) => `${x}-${BINS[i + 1]} m (${n[i]}) ${((100 * has[i]!) / n[i]!).toFixed(0)}/${((100 * clean[i]!) / n[i]!).toFixed(0)} ${JSON.stringify(why[i])}`);
      console.log(`SGL ${height === 1 ? 'driven' : 'lob   '} | ${cols.join(' | ')}`);
    }
  });
});
