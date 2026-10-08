import { describe, it } from 'vitest';
import { BASE, fmtRebound, HEAVY, runRebound, type ReboundCase } from './reboundBench';

// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench/rebound
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

const CASES: [string, Omit<ReboundCase, 'speed'>][] = [
  ['post, from the front 8 m', { target: 'post', dist: 8, angle: 0 }],
  ['post, near side 8 m 30°', { target: 'post', dist: 8, angle: 30 }],
  ['post, far side 8 m -30°', { target: 'post', dist: 8, angle: -30 }],
  ['bar, from the front 8 m', { target: 'bar', dist: 8, angle: 0 }],
  ['bar, from 14 m', { target: 'bar', dist: 14, angle: 0 }],
  ['side net, closed angle 5 m 75°', { target: 'sideNet', dist: 5, angle: 75 }],
  ['top net, lob from 6 m', { target: 'topNet', dist: 6, angle: 0 }],
  ['end boards, wide 12 m 0°', { target: 'endBoards', dist: 12, angle: 0 }],
  ['end boards, wide 12 m 25°', { target: 'endBoards', dist: 12, angle: 25 }],
  ['corner, from 15 m 30°', { target: 'corner', dist: 15, angle: 30 }],
];

run('rebound bench (F1.5c)', () => {
  it('posts, crossbar, net, end boards and corners at 20 and 28 m/s: normal ball and heavy ball', { timeout: 3600000 }, () => {
    for (const [ball, t] of [['normal', BASE()], ['heavy ', HEAVY()]] as const) {
      for (const [name, c] of CASES) {
        for (const speed of c.target === 'topNet' ? [0] : [20, 28]) {
          const s = runRebound(t, { ...c, speed });
          console.log(`REB ${ball} ${name.padEnd(31)} ${c.target === 'topNet' ? `lob ${s.launchSpeed.toFixed(1)}` : `${speed} m/s`.padStart(8)} | ${fmtRebound(s)}`);
        }
      }
    }
  });
});
