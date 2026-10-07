import { describe, it } from 'vitest';
import {
  asV0120,
  BASE_TUNING,
  FIRST_TOUCH,
  fmt,
  IDEAL,
  measureTurn,
  REACTIVE,
  runMany,
  runSingles,
} from './passBench';

// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

run('passing bench', () => {
  it('chains of 5 passes among the 3 players (300 seeds): v0.1.20 numbers vs now', { timeout: 900000 }, () => {
    for (const [name, t, levels] of [
      ['v0.1.20', asV0120(BASE_TUNING()), ['light', 'strong']],
      ['v0.1.21', BASE_TUNING(), ['light', 'medium', 'strong']],
    ] as const) {
      for (const level of levels) {
        console.log(`CHAIN ${name} ${level.padEnd(6)} ideal      ${fmt(runMany(t, level, IDEAL, 300))}`);
        console.log(`CHAIN ${name} ${level.padEnd(6)} reactive   ${fmt(runMany(t, level, REACTIVE, 300))}`);
        console.log(`CHAIN ${name} ${level.padEnd(6)} firstTouch ${fmt(runMany(t, level, FIRST_TOUCH, 300))}`);
      }
    }
  });

  it('single passes (150 per case, receiver moving, aiming error ±0.12 rad): has it / clean control', { timeout: 900000 }, () => {
    for (const [name, t, levels] of [
      ['v0.1.20', asV0120(BASE_TUNING()), ['light']],
      ['v0.1.21', BASE_TUNING(), ['light', 'medium', 'strong']],
    ] as const) {
      for (const level of levels) {
        for (const [kind, h] of [['ground', 0], ['driven', 1], ['lob', 2]] as const) {
          const f = (lo: number, hi: number): string => {
            const s = runSingles(t, level, h, lo, hi, 0.12);
            return `${s.has.toFixed(0)}/${s.clean.toFixed(0)}`;
          };
          console.log(`SINGLE ${name} ${level.padEnd(6)} ${kind.padEnd(6)} short(5-12) ${f(5, 12)} | medium(13-22) ${f(13, 22)} | long(23-35) ${f(23, 35)}`);
        }
      }
    }
  });

  it('changing direction 90° at full speed: flick (trencada) vs a gradual turn', { timeout: 120000 }, () => {
    const t = BASE_TUNING();
    const fmtCut = (name: string, c: ReturnType<typeof measureTurn>): string => `TURN ${name.padEnd(28)} cut ${c.cut} | turned ${c.turned.toFixed(2)}s | back to 90% speed ${c.recovered.toFixed(2)}s over ${c.distance.toFixed(1)}m`;
    console.log(fmtCut('flick (trencada), prepTime 0.3', measureTurn(t, 0)));
    const t2 = BASE_TUNING();
    t2.cut.prepTime = 0.15;
    console.log(fmtCut('flick, prepTime 0.15 (proposal)', measureTurn(t2, 0)));
    console.log(fmtCut('gradual turn over 0.6 s', measureTurn(t, 0.6)));
    console.log(fmtCut('gradual turn over 0.3 s', measureTurn(t, 0.3)));
  });
});
