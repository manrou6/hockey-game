import { describe, it } from 'vitest';
import { runCase, summary, type After, type Passer, type Receiver, type Result } from './volleyCueRealFlow';

// Diagnosis bench of the v0.1.28 report (the real flow of game.ts: driven lofted pass → volley
// window / cue / slow-mo); the emulation itself is in volleyCueRealFlow.ts (runCase).
//   PATINS_BENCH=1 npx vitest run tests/unit/bench/volleyCueRealFlow
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

const SEEDS = 12;
const DISTS = [6, 8, 10, 12, 14, 16, 18, 20];

run('real flow: driven lofted pass → volley window / cue / slow-mo (bug report v0.1.28)', () => {
  it('speed 1, 60 Hz: all cases', { timeout: 600000 }, () => {
    for (const after of ['release', 'goal', 'goalSoft'] as After[]) {
      for (const passer of ['stand', 'skate', 'sprint'] as Passer[]) {
        for (const receiver of ['still', 'moving'] as Receiver[]) {
          for (const d of DISTS) {
            const rs: Result[] = [];
            for (const angleDeg of [0, 35]) for (let s = 1; s <= SEEDS; s++) rs.push(runCase({ d, passer, receiver, after, angleDeg, speed: 1 }, s));
            console.log(summary(`${after.padEnd(7)} ${passer.padEnd(6)} ${receiver.padEnd(6)} ${String(d).padStart(2)} m`, rs));
          }
        }
      }
    }
  });
  it('cue-reactive TIR tap (0.22 s reaction to the lit button)', { timeout: 600000 }, () => {
    for (const passer of ['stand', 'sprint'] as Passer[]) {
      for (const d of DISTS) {
        const rs: Result[] = [];
        for (const angleDeg of [0, 35]) for (let s = 1; s <= SEEDS; s++) rs.push(runCase({ d, passer, receiver: 'still', after: 'cueTap', angleDeg, speed: 1 }, s));
        console.log(summary(`cueTap  ${passer.padEnd(6)} still  ${String(d).padStart(2)} m`, rs));
      }
    }
  });
  it('game speed 0.8 / 1.4 and 120 Hz display', { timeout: 600000 }, () => {
    for (const [speed, hz] of [[0.8, 60], [1.4, 60], [1, 120], [1.4, 120]] as [number, number][]) {
      for (const passer of ['stand', 'sprint'] as Passer[]) {
        for (const d of [8, 12, 16, 18]) {
          const rs: Result[] = [];
          for (const after of ['release', 'goal'] as After[]) for (const angleDeg of [0, 35]) for (let s = 1; s <= SEEDS; s++) rs.push(runCase({ d, passer, receiver: 'still', after, angleDeg, speed, hz }, s));
          console.log(summary(`speed ${speed} ${hz}Hz ${passer.padEnd(6)} ${String(d).padStart(2)} m`, rs));
        }
      }
    }
  });
  it('split by pass angle, stick to the goal after the pass: 0 vs 35 deg', { timeout: 600000 }, () => {
    for (const angleDeg of [0, 35]) {
      for (const passer of ['stand', 'sprint'] as Passer[]) {
        for (const d of [8, 12, 16]) {
          const rs: Result[] = [];
          for (let s = 1; s <= 24; s++) rs.push(runCase({ d, passer, receiver: 'still', after: 'goal', angleDeg, speed: 1 }, s));
          console.log(summary(`goal ang ${angleDeg} ${passer.padEnd(6)} ${String(d).padStart(2)} m`, rs));
        }
      }
    }
  });
});
