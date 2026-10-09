import { describe, it } from 'vitest';
import { BASE_TUNING, contactHeights, fmtDirect, fmtProfile, fmtVolley, passProfile, runVolley, runVolleyDirect, type PassType, type VolleyCase } from './volleyBench';

// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench/volley
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

const HUMANS: [string, number][] = [
  ['good  ', 0.04],
  ['normal', 0.07],
  ['clumsy', 0.1],
];

run('volley bench (F1.5d)', () => {
  it('height of the ball when it gets to the receiver (no TIRO)', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const pass of ['drive', 'lob'] as PassType[]) {
      for (const passDist of [8, 12, 16]) {
        const h = contactHeights(t, 'medium', { pass, passDist, dist: 7, angle: 0, timing: 0, aimLead: 0, gesture: 'tap' });
        const q = (f: number): string => (h[Math.min(h.length - 1, Math.floor(f * h.length))] ?? Number.NaN).toFixed(2);
        const share = (a: number, b: number): string => ((100 * h.filter((x) => x >= a && x < b).length) / h.length).toFixed(0).padStart(3);
        console.log(`VOLZ ${pass.padEnd(5)} ${String(passDist).padStart(2)} m | p10 ${q(0.1)} p25 ${q(0.25)} median ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} | <0.03 ${share(-1, 0.03)}% 0.03-0.15 ${share(0.03, 0.15)}% 0.15-0.35 ${share(0.15, 0.35)}% 0.35-1.05 ${share(0.35, 1.05)}% >1.05 ${share(1.05, 9)}%`);
      }
    }
  });

  it('first-time shot of a teammate pass: driven lofted / lob / ground, normal human, Mitjana', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const pass of ['drive', 'lob', 'ground'] as PassType[]) {
      for (const passDist of [8, 12, 16]) {
        for (const [dist, angle] of [[7, 0], [7, 30], [9, 0]] as const) {
          const c: VolleyCase = { pass, passDist, dist, angle, timing: 0.07, aimLead: 0.05, gesture: 'tap' };
          console.log(`VOL ${pass.padEnd(6)} pass ${String(passDist).padStart(2)} m to ${dist} m ${String(angle).padStart(2)}° | ${fmtVolley(runVolley(t, 'medium', c))}`);
        }
      }
    }
  });

  it('what stops it: driven lofted pass from 12 m to 7 m, normal human', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    const variants: [string, Partial<VolleyCase>][] = [
      ['aims the stick just before (default)', {}],
      ['never touches the stick (far post) ', { aim: 'none' }],
      ['drag for a high shot (0.25 s)      ', { gesture: 'drag' }],
      ['releases right at the arrival      ', { aimLead: 0 }],
      ['releases 0.1 s before the arrival  ', { aimLead: 0.1 }],
      ['good human (0.04 s)                ', { timing: 0.04 }],
      ['clumsy human (0.10 s)              ', { timing: 0.1 }],
    ];
    for (const [name, v] of variants) {
      const c: VolleyCase = { pass: 'drive', passDist: 12, dist: 7, angle: 0, timing: 0.07, aimLead: 0.05, gesture: 'tap', ...v };
      console.log(`VOLWHY ${name} | ${fmtVolley(runVolley(t, 'medium', c))}`);
    }
  });

  it('driven lofted pass from 12 m to 7 m: humans, aim, gesture', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const [name, timing] of HUMANS) {
      for (const aimLead of [0, 0.05, 0.1]) {
        for (const gesture of ['tap', 'drag'] as const) {
          const c: VolleyCase = { pass: 'drive', passDist: 12, dist: 7, angle: 0, timing, aimLead, gesture };
          console.log(`VOLH ${name} lead ${aimLead.toFixed(2)} ${gesture.padEnd(4)} | ${fmtVolley(runVolley(t, 'medium', c))}`);
        }
      }
    }
  });
});

run('volley bench after (F1.5d)', () => {
  it('first-time shot of a teammate pass with the remate en el aire: the human follows the TIR cue', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const pass of ['drive', 'lob', 'ground'] as PassType[]) {
      for (const passDist of [8, 12, 16]) {
        for (const [dist, angle] of [[7, 0], [7, 30], [9, 0]] as const) {
          const c: VolleyCase = { pass, passDist, dist, angle, timing: 0.07, aimLead: 0, gesture: 'tap', followCue: true };
          console.log(`VOLA ${pass.padEnd(6)} pass ${String(passDist).padStart(2)} m to ${dist} m ${String(angle).padStart(2)}° | ${fmtVolley(runVolley(t, 'medium', c))}`);
        }
      }
    }
  });
  it('driven lofted pass from 12 m to 7 m: humans and gestures with the cue', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const [name, timing] of HUMANS) {
      for (const gesture of ['tap', 'drag'] as const) {
        for (const aim of ['zone', 'none'] as const) {
          const c: VolleyCase = { pass: 'drive', passDist: 12, dist: 7, angle: 0, timing, aimLead: 0, gesture, aim, followCue: true };
          console.log(`VOLAH ${name} ${gesture.padEnd(4)} ${aim.padEnd(4)} | ${fmtVolley(runVolley(t, 'medium', c))}`);
        }
      }
    }
  });
});

run('volley geometry (F1.5d)', () => {
  it('where the pass comes from: back / side / front, normal human with the cue, Mitjana', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const from of ['back', 'side', 'front'] as const) {
      for (const pass of ['drive', 'lob', 'ground'] as PassType[]) {
        for (const [dist, angle] of [[7, 0], [7, 30], [9, 0]] as const) {
          const c: VolleyCase = { pass, passDist: 10, dist, angle, timing: 0.07, aimLead: 0, gesture: 'tap', followCue: true, from };
          console.log(`VOLG ${from.padEnd(5)} ${pass.padEnd(6)} to ${dist} m ${String(angle).padStart(2)}° | ${fmtVolley(runVolley(t, 'medium', c))}`);
        }
      }
    }
  });
});

run('volley skill cap (F1.5d)', () => {
  it('ball speed x contact height x angle (front-side delivery, normal human, Mitjana)', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const [dist, angle] of [[7, 0], [7, 30], [7, 55], [10, 0]] as const) {
      for (const speed of [6, 10, 14, 18]) {
        const cols = [0.2, 0.45, 0.8, 1.0, 1.3].map((height) => `${height.toFixed(2)} m ${fmtDirect(runVolleyDirect(t, 'medium', { dist, angle, speed, height, timing: 0.07 })).replace(/ \| contact.*/, '')}`);
        console.log(`VOLD ${dist} m ${String(angle).padStart(2)}° ${String(speed).padStart(2)} m/s | ${cols.join(' || ')}`);
      }
    }
  });
  it('timing curve: a fixed release offset from the cue (no human error), 7 m 0°, 10 m/s, 0.45 m', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const offset of [-0.25, -0.2, -0.15, -0.1, -0.08, -0.05, 0, 0.05, 0.08, 0.1, 0.15, 0.2, 0.25]) {
      console.log(`VOLT ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} s | ${fmtDirect(runVolleyDirect(t, 'medium', { dist: 7, angle: 0, speed: 10, height: 0.45, timing: 0, offset }))}`);
    }
  });
});

run('volley F1.5e: the real volley', () => {
  it('how the pass flies to the receiver: driven lofted and lob, by distance (no TIRO)', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const pass of ['drive', 'lob'] as PassType[]) {
      for (const passDist of [5, 8, 12, 16, 18, 20, 22, 25]) {
        const c: VolleyCase = { pass, passDist, dist: 7, angle: 0, timing: 0, aimLead: 0, gesture: 'tap', from: 'behind' };
        console.log(`VOLP ${pass.padEnd(5)} ${String(passDist).padStart(2)} m | ${fmtProfile(passProfile(t, 'medium', c))}`);
      }
    }
  });
  it('first-time shot of a driven lofted pass, normal human with the cue: how many strikes are really in the air', { timeout: 3600000 }, () => {
    const t = BASE_TUNING();
    for (const pass of ['drive', 'lob'] as PassType[]) {
      for (const passDist of [8, 12, 16]) {
        for (const [dist, angle] of [[7, 0], [7, 30], [9, 0]] as const) {
          const c: VolleyCase = { pass, passDist, dist, angle, timing: 0.07, aimLead: 0, gesture: 'tap', followCue: true };
          console.log(`VOLE ${pass.padEnd(6)} pass ${String(passDist).padStart(2)} m to ${dist} m ${String(angle).padStart(2)}° | ${fmtVolley(runVolley(t, 'medium', c))}`);
        }
      }
    }
  });
});
