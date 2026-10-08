import { describe, it } from 'vitest';
import type { Tuning } from '../../../src/config/tuning';
import { BASE_TUNING, fmtShots, runFirstTouch, runShots, runTurn, type ReleaseContext, type ShotState, type ShotType } from './shotBench';

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

run('first-touch and turn shots (F1.5b)', () => {
  it('first-touch shot after a ground pass (Mitjana, 300 per case)', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const from of ['side', 'behind', 'front'] as const) {
      for (const timing of ['before', 'after'] as const) {
        for (const [dist, angle] of [[7, 0], [7, 30], [10, 0], [10, 30]] as const) {
          const s = runFirstTouch(t, 'medium', dist, angle, from, timing);
          console.log(`FIRST ${from.padEnd(6)} ${timing.padEnd(6)} ${String(dist).padStart(2)} m ${String(angle).padStart(2)}° | clean reception ${s.clean.toFixed(0)}% | shot ${s.shot.toFixed(0)}% | on target ${s.onTarget.toFixed(0)}% (after a clean one ${s.onTargetAfterClean.toFixed(0)}%) | zone ${s.inZone.toFixed(0)}% | leaves ${s.delay.toFixed(2)} s after the ball arrives`);
        }
      }
    }
  });

  it('turn shot (media vuelta), Mitjana', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const dist of [3, 5, 8]) {
      for (const state of ['stand', 'away'] as const) {
        for (const stick of ['released', 'aim'] as const) {
          const s = runTurn(t, 'medium', dist, state, stick);
          console.log(`TURN ${dist} m ${state.padEnd(5)} stick ${stick.padEnd(8)} | turn ${s.turned.toFixed(0)}% | leaves ${s.fromRelease.toFixed(2)} s after releasing (${s.fromPress.toFixed(2)} s after pressing) | on target ${s.onTarget.toFixed(0)}%`);
        }
      }
    }
  });
});

run('F1.5b sweeps', () => {
  it('first-touch error sweep (Mitjana, before timing)', { timeout: 3600000 }, () => {
    for (const [fte, red, free] of [[1.25, 2, 45], [1.25, 1, 45], [1.25, 1, 90], [1.25, 0, 90], [1, 1, 90], [1, 0, 90]] as const) {
      const t = BASE_TUNING();
      t.shot.firstTouchError = fte;
      t.shot.errorRedirect = (red * Math.PI) / 180;
      t.shot.redirectFree = (free * Math.PI) / 180;
      const cols: string[] = [];
      for (const from of ['front', 'side'] as const) {
        for (const [dist, angle] of [[7, 0], [7, 30], [10, 0]] as const) {
          const s = runFirstTouch(t, 'medium', dist, angle, from, 'before', 200);
          cols.push(`${from} ${dist}m ${angle}° ${s.onTargetAfterClean.toFixed(0)}/${s.onTarget.toFixed(0)}`);
        }
      }
      console.log(`FTSWEEP fte ${fte} redirect ${red}°/rad free ${free}° | ${cols.join(' | ')}`);
    }
  });
});

// --- Error model options for the F1.5c review (NOT applied: emulated in the bench by setting the
// error numbers of a private tuning copy just before each release). ------------------------------


/** Option 2 (Guillem's preference): the error grows with distance, a closed angle, moving and a
 * sprint; still precise standing, square-on and charged; aim from shotAccuracy (75 = today's). */
function option2(accuracy: number) {
  return (t: Tuning, base: Tuning, c: ReleaseContext): void => {
    const b = base.shot;
    const dist = 1 + 0.05 * Math.max(0, c.dist - 6);
    const angle = 1 + 0.5 * Math.min(1, c.angle / 60);
    const move = 1 + 0.5 * Math.min(1, c.speed / base.skating.maxSpeed);
    // Today: × (1 − 0.5 × 75/99) = 0.621 for everybody; proposed: from shotAccuracy, the same at 75.
    const acc = (1 - b.attributeAdvantage * (75 / 99)) * (1 + 0.9 * ((75 - accuracy) / 99));
    t.shot.attributeAdvantage = 0;
    t.shot.errorBase = b.errorBase * dist * angle * move * acc;
    t.shot.errorSprint = 2 * b.errorSprint * acc;
    t.shot.errorOffBalance = b.errorOffBalance * acc;
    t.shot.errorTurn = b.errorTurn * acc;
  };
}

/** Option 3: a sweet spot of power: beyond 85 % of the charge the extra speed adds error (×2 at 100 %). */
function option3(t: Tuning, base: Tuning, c: ReleaseContext): void {
  const extra = c.quick ? 0 : Math.max(0, (c.charge - 0.85) / 0.15);
  t.shot.errorBase = base.shot.errorBase * (1 + extra);
}

run('shot error model options (F1.5c review, not applied)', () => {
  it('options 1 / 2 / 3: on target % / in the zone %, Mitjana, low shots, 300 per case', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    const options: [string, ((t: Tuning, b: Tuning, c: ReleaseContext) => void) | undefined][] = [
      ['opt1', undefined],
      ['opt2', option2(75)],
      ['opt3', option3],
    ];
    for (const [name, hook] of options) {
      for (const type of (name === 'opt3' ? ['quick', 'sweet', 'full'] : ['quick', 'full']) as ShotType[]) {
        for (const dist of [7, 14, 18]) {
          for (const angle of [0, 30, 55]) {
            const cols = STATES.map((state) => {
              const st = runShots(t, 'medium', { dist, angle, state, type, height: 0 }, 300, hook ? { beforeRelease: hook } : {});
              return st.valid ? `${state.padEnd(6)} ${st.onTarget.toFixed(0).padStart(3)}% z${st.inZone.toFixed(0).padStart(3)}% w${st.wide.toFixed(0).padStart(2)}% p${st.woodwork.toFixed(0)}%` : `${state.padEnd(6)}   (fuera de la pista)   `;
            });
            console.log(`ERR ${name} ${type.padEnd(5)} ${String(dist).padStart(2)} m ${String(angle).padStart(2)}° | ${cols.join(' | ')}`);
          }
        }
      }
    }
  });

  it('the Tir attribute: 40 vs 90 (today: one attribute, error only) and option 2 (shotAccuracy)', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const acc of [40, 75, 90]) {
      for (const [dist, type] of [[7, 'quick'], [14, 'quick'], [14, 'full'], [18, 'full']] as const) {
        const cols = (['stand', 'skate'] as ShotState[]).map((state) => {
          const now = runShots(t, 'medium', { dist, angle: 0, state, type, height: 0 }, 300, { shooting: acc });
          const o2 = runShots(t, 'medium', { dist, angle: 0, state, type, height: 0 }, 300, { beforeRelease: option2(acc) });
          return `${state.padEnd(5)} today ${now.onTarget.toFixed(0)}%/z${now.inZone.toFixed(0)}% opt2 ${o2.onTarget.toFixed(0)}%/z${o2.inZone.toFixed(0)}%`;
        });
        console.log(`ATTR ${String(acc).padStart(2)} ${type.padEnd(5)} ${dist} m 0° | ${cols.join(' | ')}`);
      }
    }
  });
});

