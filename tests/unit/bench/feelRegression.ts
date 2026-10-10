import { TUNING, type Tuning } from '../../../src/config/tuning';
import type { AssistLevel } from '../../../src/sim/pass';
import { runAirSingles } from './airPassBench';
import { DISTS as DRIVE_DISTS, runDrive, type DriveCase, type DriveStats } from './driveAimBench';
import { FIRST_TOUCH, IDEAL, REACTIVE, runMany, runSingles, runSpace, type HumanPolicy } from './passBench';
import { BASE as REBOUND_BASE, HEAVY, runRebound, type ReboundCase } from './reboundBench';
import { runFirstTouch, runShots, runTurn, type ShotCase, type ShotState, type ShotType } from './shotBench';
import { passProfile, runVolley, runVolleyDirect, type PassType, type VolleyCase } from './volleyBench';
import { runCase, type After, type Passer } from './volleyCueRealFlow';

// Feel-regression bench (bloque 2, §J): a curated, deterministic subset of the pass, shot,
// volley and rebound benches, reduced to one flat set of metrics that is compared with a
// versioned baseline (tests/unit/bench/baseline/feel-v<version>.json). The scenarios, seeds and
// sample sizes below ARE the definition of the baseline: changing any of them changes the numbers,
// so the baseline must be rewritten in the same change (npm run bench:feel:write).
// Run with `npm run bench:feel` (see feelRegression.test.ts and docs/audit/J.md).

/** Units of the metrics; each one has its own tolerance. */
export type Unit = '%' | 's' | 'm' | 'm/s' | 'n';

/** Allowed |now − baseline| per unit before a metric is flagged (the sim is deterministic: with
 * unchanged code every metric is identical; these only decide what counts as a regression). */
export const TOLERANCE: Readonly<Record<Unit, number>> = { '%': 1, s: 0.02, m: 0.02, 'm/s': 0.2, n: 0 };

export interface Metric {
  /** Rounded to 4 decimals; null when the bench gives no number (NaN: nothing to average). */
  value: number | null;
  unit: Unit;
}

export type Metrics = Record<string, Metric>;

const round = (v: number): number => {
  const r = Math.round(v * 1e4) / 1e4;
  return r === 0 ? 0 : r; // no -0 in the JSON
};

class Collector {
  readonly metrics: Metrics = {};
  add(key: string, unit: Unit, value: number): void {
    if (key in this.metrics) throw new Error(`feelRegression: duplicate metric ${key}`);
    this.metrics[key] = { value: Number.isFinite(value) ? round(value) : null, unit };
  }
}

const LEVELS: AssistLevel[] = ['light', 'medium', 'strong'];
const fresh = (): Tuning => structuredClone(TUNING);

// --- Passing --------------------------------------------------------------------------------

/** Chains of 5 passes among the 3 players (passBench.runMany, 300 chains per case). */
function passChains(c: Collector): void {
  const t = fresh();
  const policies: [string, HumanPolicy][] = [
    ['ideal', IDEAL],
    ['reactive', REACTIVE],
    ['firstTouch', FIRST_TOUCH],
  ];
  for (const level of LEVELS) {
    for (const [name, policy] of policies) {
      const s = runMany(t, level, policy, 300);
      const k = `chain.${level}.${name}`;
      c.add(`${k}.done`, '%', s.completedPct);
      c.add(`${k}.time`, 's', s.totalMean);
      c.add(`${k}.clean`, '%', s.cleanPct);
    }
  }
}

/** One pass to a teammate by nominal distance, level and height (passBench.runSingles, 150 per case). */
function singlePasses(c: Collector): void {
  const t = fresh();
  for (const level of LEVELS) {
    for (const [kind, h] of [['ground', 0], ['driven', 1], ['lob', 2]] as const) {
      for (const [lo, hi] of [[5, 12], [13, 22], [23, 35]] as const) {
        const s = runSingles(t, level, h, lo, hi, 0.12);
        const k = `single.${level}.${kind}.${lo}-${hi}m`;
        c.add(`${k}.has`, '%', s.has);
        c.add(`${k}.clean`, '%', s.clean);
      }
    }
  }
}

/** Pass into space to a running teammate (passBench.runSpace, 150 per case). */
function passIntoSpace(c: Collector): void {
  const t = fresh();
  const cases: [AssistLevel, number][] = [
    ['medium', 1],
    ['medium', 1.4],
    ['light', 1.2],
    ['strong', 1.2],
  ];
  for (const [level, lead] of cases) {
    for (const receive of ['chase', 'release'] as const) {
      const s = runSpace(t, level, { lead, receive });
      const k = `space.${level}.lead${lead.toFixed(1)}.${receive}`;
      c.add(`${k}.has`, '%', s.has);
      c.add(`${k}.clean`, '%', s.clean);
      c.add(`${k}.time`, 's', s.timeMean);
    }
  }
  // A fully charged pass into space (hold 0.85 s, stick barely pushed): how hard it arrives.
  for (const receive of ['chase', 'release'] as const) {
    const s = runSpace(t, 'medium', { lead: 1.2, receive, hold: 0.85, aimMag: 0.2 });
    const k = `space.medium.lead1.2.full.${receive}`;
    c.add(`${k}.has`, '%', s.has);
    c.add(`${k}.time`, 's', s.timeMean);
    c.add(`${k}.arrival`, 'm/s', s.arrival);
  }
}

/** How the driven lofted pass and the lob fly to a receiver (volleyBench.passProfile, 200 per case). */
function airFlight(c: Collector): void {
  const t = fresh();
  const dists: Record<'drive' | 'lob', number[]> = { drive: [5, 8, 12, 16, 20], lob: [8, 12, 16, 20] };
  for (const pass of ['drive', 'lob'] as const) {
    for (const passDist of dists[pass]) {
      const vc: VolleyCase = { pass, passDist, dist: 7, angle: 0, timing: 0, aimLead: 0, gesture: 'tap', from: 'behind' };
      const s = passProfile(t, 'medium', vc);
      const k = `flight.${pass}.${passDist}m`;
      c.add(`${k}.heightAtHim`, 'm', s.median);
      c.add(`${k}.comfy`, '%', s.comfy);
      c.add(`${k}.timeToHim`, 's', s.time);
      if (pass === 'lob') c.add(`${k}.apex`, 'm', s.apex);
    }
  }
}

/** Single driven lofted passes and lobs by REAL distance (airPassBench.runAirSingles, 1200 seeds). */
function airSingles(c: Collector): void {
  const t = fresh();
  const bins = [5, 12, 17, 20, 25, 36];
  for (const [kind, height] of [['driven', 1], ['lob', 2]] as const) {
    const s = runAirSingles(t, height, bins);
    for (let i = 0; i < bins.length - 1; i++) {
      const n = s.n[i]!;
      const k = `airSingle.${kind}.${bins[i]}-${bins[i + 1]}m`;
      c.add(`${k}.has`, '%', (100 * s.has[i]!) / n);
      c.add(`${k}.clean`, '%', (100 * s.clean[i]!) / n);
      if (kind === 'driven') c.add(`${k}.air`, '%', (100 * (s.why[i]!['high-ok'] ?? 0)) / n);
    }
  }
}

/** Aim of the driven lofted pass, 8-16 m pooled (driveAimBench.runDrive, 300 per distance). */
function driveAim(c: Collector): void {
  const t = fresh();
  const pool = (dc: Omit<DriveCase, 'dist'>): Record<'launchMean' | 'launchP90' | 'has' | 'clean' | 'air', number> => {
    const per = DRIVE_DISTS.map((dist) => runDrive(t, { ...dc, dist }));
    const nn = per.reduce((a, s) => a + s.n, 0);
    const avg = (key: keyof DriveStats): number => per.reduce((a, s) => a + s[key] * s.n, 0) / Math.max(1, nn);
    return { launchMean: avg('launchMean'), launchP90: avg('launchP90'), has: avg('has'), clean: avg('clean'), air: avg('air') };
  };
  const cases: [string, Omit<DriveCase, 'dist'>][] = [];
  for (const level of ['medium', 'strong'] as const) {
    for (const passer of ['still', 'sprint'] as const) {
      for (const receiver of ['still', 'run'] as const) cases.push([`${level}.${passer}-${receiver}`, { level, passer, receiver, n: 300 }]);
    }
    // A sloppier aim (20° off the teammate): what the Mitjana driven-pass correction buys.
    cases.push([`${level}.still-still.20degOff`, { level, passer: 'still', receiver: 'still', n: 300, aimBias: 0.349 }]);
    cases.push([`${level}.sprint-run.20degOff`, { level, passer: 'sprint', receiver: 'run', n: 300, aimBias: 0.349 }]);
  }
  for (const [name, dc] of cases) {
    const s = pool(dc);
    const k = `driveAim.${name}`;
    c.add(`${k}.launchErr`, 'm', s.launchMean);
    c.add(`${k}.launchErrP90`, 'm', s.launchP90);
    c.add(`${k}.has`, '%', s.has);
    c.add(`${k}.clean`, '%', s.clean);
    c.add(`${k}.air`, '%', s.air);
  }
}

// --- Shooting -------------------------------------------------------------------------------

/** Shots at the empty goal (shotBench.runShots, 300 per case): on target and in the aimed zone. */
function shots(c: Collector): void {
  const t = fresh();
  const shoot = (level: AssistLevel, sc: ShotCase): ReturnType<typeof runShots> => {
    const s = runShots(t, level, sc);
    if (!s.valid) throw new Error(`feelRegression: shot case outside the rink ${JSON.stringify(sc)}`);
    return s;
  };
  const states: ShotState[] = ['stand', 'skate', 'sprint'];
  const spots: [ShotType, number, number][] = [
    ['quick', 7, 0],
    ['quick', 7, 30],
    ['quick', 7, 55],
    ['quick', 14, 0],
    ['quick', 14, 30],
    ['quick', 18, 0],
    ['full', 14, 0],
    ['full', 14, 30],
    ['full', 18, 0],
  ];
  for (const [type, dist, angle] of spots) {
    for (const state of states) {
      const s = shoot('medium', { dist, angle, state, type, height: 0 });
      const k = `shot.${type}.${dist}m${angle}.${state}`;
      c.add(`${k}.onTarget`, '%', s.onTarget);
      c.add(`${k}.inZone`, '%', s.inZone);
    }
  }
  // Off balance: during a trencada and a skid stop.
  for (const state of ['cut', 'skid'] as const) {
    for (const angle of [0, 30]) {
      const s = shoot('medium', { dist: 7, angle, state, type: 'quick', height: 0 });
      const k = `shot.quick.7m${angle}.${state}`;
      c.add(`${k}.onTarget`, '%', s.onTarget);
      c.add(`${k}.offBalance`, '%', s.offBalance);
    }
  }
  // The other assist levels (Mitjana is above).
  for (const level of ['off', 'light', 'strong'] as const) {
    for (const [type, dist, angle, state] of [['quick', 7, 0, 'stand'], ['full', 14, 30, 'skate']] as const) {
      const s = shoot(level, { dist, angle, state, type, height: 0 });
      const k = `shot.level.${level}.${type}.${dist}m${angle}.${state}`;
      c.add(`${k}.onTarget`, '%', s.onTarget);
      c.add(`${k}.inZone`, '%', s.inZone);
    }
  }
  // High shot and chip (diagonal drag), standing.
  for (const [name, height, dist] of [['high', 1, 7], ['chip', 2, 10]] as const) {
    const s = shoot('medium', { dist, angle: 0, state: 'stand', type: 'quick', height });
    const k = `shot.${name}.quick.${dist}m0.stand`;
    c.add(`${k}.onTarget`, '%', s.onTarget);
    c.add(`${k}.inZone`, '%', s.inZone);
  }
  // Timing and speed: tap / half / full charge, standing, 7 and 14 m.
  for (const type of ['quick', 'half', 'full'] as const) {
    for (const dist of [7, 14]) {
      const s = shoot('medium', { dist, angle: 0, state: 'stand', type, height: 0 });
      const k = `shot.timing.${type}.${dist}m0.stand`;
      c.add(`${k}.release`, 's', s.release);
      c.add(`${k}.speedAtGoal`, 'm/s', s.speedAtGoal);
      c.add(`${k}.flight`, 's', s.flight);
    }
  }
}

/** First-touch shot after a ground pass (shotBench.runFirstTouch, 300 per case). */
function firstTouch(c: Collector): void {
  const t = fresh();
  for (const from of ['side', 'behind', 'front'] as const) {
    for (const timing of ['before', 'after'] as const) {
      for (const [dist, angle] of [[7, 0], [10, 30]] as const) {
        const s = runFirstTouch(t, 'medium', dist, angle, from, timing);
        const k = `firstTouch.${from}.${timing}.${dist}m${angle}`;
        c.add(`${k}.clean`, '%', s.clean);
        c.add(`${k}.onTarget`, '%', s.onTarget);
        c.add(`${k}.delay`, 's', s.delay);
      }
    }
  }
}

/** Turn shot (media vuelta) with the back to the goal (shotBench.runTurn, 300 per case). */
function turnShot(c: Collector): void {
  const t = fresh();
  for (const dist of [3, 5, 8]) {
    for (const state of ['stand', 'away'] as const) {
      for (const stick of ['released', 'aim'] as const) {
        const s = runTurn(t, 'medium', dist, state, stick);
        const k = `turn.${dist}m.${state}.${stick}`;
        c.add(`${k}.turned`, '%', s.turned);
        c.add(`${k}.timeFromPress`, 's', s.fromPress);
        c.add(`${k}.onTarget`, '%', s.onTarget);
      }
    }
  }
}

// --- Volley ---------------------------------------------------------------------------------

/** First-time shot of a teammate's pass following the TIR cue (volleyBench.runVolley, 200 per case). */
function volley(c: Collector): void {
  const t = fresh();
  const cases: [PassType, number, number, number, number][] = [
    // pass, pass distance, receiver distance to the goal, angle, human timing sd (s)
    ['drive', 8, 7, 0, 0.07],
    ['drive', 12, 7, 0, 0.07],
    ['drive', 16, 7, 0, 0.07],
    ['drive', 12, 7, 30, 0.07],
    ['drive', 12, 9, 0, 0.07],
    ['drive', 12, 7, 0, 0.04],
    ['drive', 12, 7, 0, 0.1],
    ['lob', 12, 7, 0, 0.07],
    ['ground', 12, 7, 0, 0.07],
  ];
  for (const [pass, passDist, dist, angle, timing] of cases) {
    const s = runVolley(t, 'medium', { pass, passDist, dist, angle, timing, aimLead: 0, gesture: 'tap', followCue: true });
    const k = `volley.${pass}.${passDist}m.to${dist}m${angle}.sd${timing.toFixed(2)}`;
    c.add(`${k}.shot`, '%', s.shot);
    c.add(`${k}.aerial`, '%', s.aerial);
    c.add(`${k}.goodTiming`, '%', s.goodTiming);
    c.add(`${k}.onTarget`, '%', s.onTarget);
  }
  // A ball delivered straight to the blade at a given speed and height (volleyBench.runVolleyDirect).
  for (const [dist, angle, speed, height] of [[7, 0, 10, 0.45], [7, 30, 10, 0.8], [10, 0, 6, 1.0]] as const) {
    const s = runVolleyDirect(t, 'medium', { dist, angle, speed, height, timing: 0.07 });
    if (!s.valid) throw new Error(`feelRegression: direct volley case outside the rink ${dist} m ${angle}° ${speed} m/s`);
    const k = `volleyDirect.${dist}m${angle}.${speed}mps.${height.toFixed(2)}m`;
    c.add(`${k}.strike`, '%', s.strike);
    c.add(`${k}.goodTiming`, '%', s.good);
    c.add(`${k}.onTarget`, '%', s.onTarget);
  }
}

/** The real flow of game.ts (driven lofted pass → volley window / TIR cue / slow-mo): volleyCueRealFlow.runCase. */
function volleyRealFlow(c: Collector): void {
  const groups: [string, number[]][] = [
    ['8-16m', [8, 12, 16]],
    ['20m', [20]],
  ];
  for (const after of ['goal', 'release'] as After[]) {
    for (const passer of ['stand', 'sprint'] as Passer[]) {
      for (const [gname, ds] of groups) {
        let n = 0;
        let found = 0;
        let cue = 0;
        let slow = 0;
        const cueSeconds: number[] = [];
        for (const d of ds) {
          for (const angleDeg of [0, 35]) {
            for (let s = 1; s <= 12; s++) {
              const r = runCase({ d, passer, receiver: 'still', after, angleDeg, speed: 1 }, s);
              n++;
              if (r.found) found++;
              if (r.cueFrames > 0) {
                cue++;
                cueSeconds.push(r.cueMs / 1000);
              }
              if (r.slow) slow++;
            }
          }
        }
        const k = `realFlow.${after === 'goal' ? 'stickAtGoal' : 'stickReleased'}.${passer}.${gname}`;
        c.add(`${k}.window`, '%', (100 * found) / n);
        c.add(`${k}.cue`, '%', (100 * cue) / n);
        // How long the cue stays lit in REAL time (s; the slow-mo stretches it), of those lit.
        c.add(`${k}.cueTime`, 's', cueSeconds.length ? cueSeconds.reduce((a, b) => a + b, 0) / cueSeconds.length : Number.NaN);
        c.add(`${k}.slowMo`, '%', (100 * slow) / n);
      }
    }
  }
}

// --- Rebounds -------------------------------------------------------------------------------

const REBOUND_CASES: [string, Omit<ReboundCase, 'speed'>][] = [
  ['post.front8m', { target: 'post', dist: 8, angle: 0 }],
  ['post.near8m30', { target: 'post', dist: 8, angle: 30 }],
  ['post.far8m-30', { target: 'post', dist: 8, angle: -30 }],
  ['bar.front8m', { target: 'bar', dist: 8, angle: 0 }],
  ['bar.front14m', { target: 'bar', dist: 14, angle: 0 }],
  ['sideNet.5m75', { target: 'sideNet', dist: 5, angle: 75 }],
  ['topNet.lob6m', { target: 'topNet', dist: 6, angle: 0 }],
  ['endBoards.12m0', { target: 'endBoards', dist: 12, angle: 0 }],
  ['endBoards.12m25', { target: 'endBoards', dist: 12, angle: 25 }],
  ['corner.15m30', { target: 'corner', dist: 15, angle: 30 }],
];

/** Balls at the posts, bar, net, end boards and corner (reboundBench.runRebound, 41 per case). */
function rebounds(c: Collector): void {
  for (const [ball, t] of [['normal', REBOUND_BASE()], ['heavy', HEAVY()]] as const) {
    let tunnels = 0;
    for (const [name, rc] of REBOUND_CASES) {
      for (const speed of rc.target === 'topNet' ? [0] : [20, 28]) {
        const s = runRebound(t, { ...rc, speed });
        tunnels += s.tunnel;
        if (ball !== 'normal') continue;
        const k = `rebound.${name}${rc.target === 'topNet' ? '' : `.${speed}mps`}`;
        c.add(`${k}.goal`, '%', s.goal);
        c.add(`${k}.front`, '%', s.front);
        c.add(`${k}.reboundSpeed`, 'm/s', s.reboundSpeed);
        c.add(`${k}.tunnels`, 'n', s.tunnel);
      }
    }
    c.add(`rebound.${ball}.tunnelsTotal`, 'n', tunnels);
  }
}

/** The sections in order (name, collector). */
export const SECTIONS: [string, (c: Collector) => void][] = [
  ['pass chains', passChains],
  ['single passes', singlePasses],
  ['pass into space', passIntoSpace],
  ['driven lofted / lob flight', airFlight],
  ['driven lofted / lob singles by real distance', airSingles],
  ['driven lofted pass aim', driveAim],
  ['shots', shots],
  ['first-touch shot', firstTouch],
  ['turn shot', turnShot],
  ['volley', volley],
  ['volley real flow (window / cue / slow-mo)', volleyRealFlow],
  ['rebounds', rebounds],
];

/** Runs every section; `onSection` gets each one's name, metric count and wall time (s). */
export function collectFeelMetrics(onSection?: (name: string, metrics: number, seconds: number) => void): Metrics {
  const c = new Collector();
  for (const [name, f] of SECTIONS) {
    const before = Object.keys(c.metrics).length;
    const t0 = performance.now();
    f(c);
    onSection?.(name, Object.keys(c.metrics).length - before, (performance.now() - t0) / 1000);
  }
  return c.metrics;
}

// --- Baseline file and comparison -------------------------------------------------------------

export interface Baseline {
  /** package.json version of the code that produced it. */
  version: string;
  metrics: Metrics;
}

/** Pretty JSON with one metric per line (stable: same metrics → byte-identical file). */
export function baselineToJson(b: Baseline): string {
  const keys = Object.keys(b.metrics);
  const lines = [
    '{',
    `  "version": ${JSON.stringify(b.version)},`,
    `  "about": ${JSON.stringify('Feel-regression baseline (tests/unit/bench/feelRegression.ts). Written by npm run bench:feel:write; compared by npm run bench:feel. Tolerances are in feelRegression.ts (TOLERANCE).')},`,
    `  "count": ${keys.length},`,
    '  "metrics": {',
    ...keys.map((k, i) => {
      const m = b.metrics[k]!;
      return `    ${JSON.stringify(k)}: { "value": ${JSON.stringify(m.value)}, "unit": ${JSON.stringify(m.unit)} }${i < keys.length - 1 ? ',' : ''}`;
    }),
    '  }',
    '}',
  ];
  return lines.join('\n') + '\n';
}

export type Status = 'same' | 'within' | 'CHANGED' | 'NEW' | 'GONE';

export interface Row {
  key: string;
  unit: Unit;
  base: number | null | undefined;
  now: number | null | undefined;
  delta: number | null;
  status: Status;
}

export const isFlagged = (r: Row): boolean => r.status === 'CHANGED' || r.status === 'NEW' || r.status === 'GONE';

export function compareMetrics(base: Metrics, now: Metrics): Row[] {
  const keys = [...Object.keys(now), ...Object.keys(base).filter((k) => !(k in now))];
  return keys.map((key): Row => {
    const b = base[key];
    const n = now[key];
    if (!b) return { key, unit: n!.unit, base: undefined, now: n!.value, delta: null, status: 'NEW' };
    if (!n) return { key, unit: b.unit, base: b.value, now: undefined, delta: null, status: 'GONE' };
    if (b.value === null || n.value === null) {
      const same = b.value === n.value && b.unit === n.unit;
      return { key, unit: n.unit, base: b.value, now: n.value, delta: null, status: same ? 'same' : 'CHANGED' };
    }
    const delta = round(n.value - b.value);
    const status: Status = n.unit !== b.unit ? 'CHANGED' : delta === 0 ? 'same' : Math.abs(delta) <= TOLERANCE[n.unit] + 1e-9 ? 'within' : 'CHANGED';
    return { key, unit: n.unit, base: b.value, now: n.value, delta, status };
  });
}

const DECIMALS: Record<Unit, number> = { '%': 1, s: 3, m: 3, 'm/s': 2, n: 0 };

function cell(v: number | null | undefined, unit: Unit, signed = false): string {
  if (v === undefined) return '(none)';
  if (v === null) return '-';
  const s = v.toFixed(DECIMALS[unit]);
  return signed && v > 0 ? `+${s}` : s;
}

/** The table: metric | unit | baseline | now | Δ | flag. */
export function formatTable(rows: Row[]): string {
  const w = Math.max(6, ...rows.map((r) => r.key.length));
  const head = `${'metric'.padEnd(w)} | unit | ${'baseline'.padStart(9)} | ${'now'.padStart(9)} | ${'Δ'.padStart(8)} |`;
  const out = [head, '-'.repeat(head.length + 24)];
  for (const r of rows) {
    const flag = r.status === 'same' ? '' : r.status === 'within' ? `~ within ±${TOLERANCE[r.unit]}` : `<<< ${r.status}${r.status === 'CHANGED' ? ` (tolerance ±${TOLERANCE[r.unit]} ${r.unit})` : ''}`;
    out.push(`${r.key.padEnd(w)} | ${r.unit.padEnd(4)} | ${cell(r.base, r.unit).padStart(9)} | ${cell(r.now, r.unit).padStart(9)} | ${cell(r.delta, r.unit, true).padStart(8)} | ${flag}`);
  }
  return out.join('\n');
}
