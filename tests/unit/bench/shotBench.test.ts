import { describe, it } from 'vitest';
import { BASE_TUNING, fmtShots, runShots, type ShotState, type ShotType } from './shotBench';

// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

const DISTS = [4, 7, 10, 14, 18];
const ANGLES = [0, 30, 55];
const STATES: ShotState[] = ['stand', 'skate', 'sprint'];

run('shooting bench (F1.5a)', () => {
  it('Mitjana, low shots: on target % / in the aimed zone % (300 per case)', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const type of ['quick', 'full'] as ShotType[]) {
      for (const dist of DISTS) {
        for (const angle of ANGLES) {
          const cols = STATES.map((state) => `${state.padEnd(6)} ${fmtShots(runShots(t, 'medium', { dist, angle, state, type, height: 0 }))}`);
          console.log(`SHOT medium low ${type.padEnd(5)} ${String(dist).padStart(2)} m ${String(angle).padStart(2)}° | ${cols.join(' | ')}`);
        }
      }
    }
  });

  it('Mitjana, high and chip shots, standing and skating', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const [hname, height] of [['high', 1], ['chip', 2]] as const) {
      for (const type of ['quick', 'full'] as ShotType[]) {
        for (const dist of DISTS) {
          for (const angle of [0, 30]) {
            const cols = (['stand', 'skate'] as ShotState[]).map((state) => `${state.padEnd(6)} ${fmtShots(runShots(t, 'medium', { dist, angle, state, type, height }))}`);
            console.log(`SHOT medium ${hname} ${type.padEnd(5)} ${String(dist).padStart(2)} m ${String(angle).padStart(2)}° | ${cols.join(' | ')}`);
          }
        }
      }
    }
  });

  it('the 4 assist levels (low, standing / skating), and timing and speed', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const level of ['off', 'light', 'medium', 'strong'] as const) {
      for (const type of ['quick', 'full'] as ShotType[]) {
        for (const [dist, angle] of [[7, 0], [7, 30], [14, 0], [14, 30]] as const) {
          const cols = (['stand', 'skate'] as ShotState[]).map((state) => `${state.padEnd(6)} ${fmtShots(runShots(t, level, { dist, angle, state, type, height: 0 }))}`);
          console.log(`LEVEL ${level.padEnd(6)} ${type.padEnd(5)} ${String(dist).padStart(2)} m ${String(angle).padStart(2)}° | ${cols.join(' | ')}`);
        }
      }
    }
    for (const type of ['quick', 'half', 'full'] as ShotType[]) {
      for (const dist of [7, 14]) {
        const s = runShots(t, 'medium', { dist, angle: 0, state: 'stand', type, height: 0 });
        console.log(`TIMING medium ${type.padEnd(5)} ${dist} m stand: leaves ${s.release.toFixed(3)} s after pressing | speed at the goal line ${s.speedAtGoal.toFixed(1)} m/s | flight ${s.flight.toFixed(2)} s | woodwork ${s.woodwork.toFixed(0)}%`);
      }
    }
  });
});
