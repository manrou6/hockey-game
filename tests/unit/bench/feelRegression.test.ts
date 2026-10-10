import { describe, expect, it } from 'vitest';
import { baselineToJson, collectFeelMetrics, compareMetrics, formatTable, isFlagged, type Baseline } from './feelRegression';

// Feel-regression gate (bloque 2, §J; docs/audit/J.md). Only with PATINS_BENCH:
//   npm run bench:feel        → runs the curated pass / shot / volley / rebound scenarios and compares
//                               every metric with the newest baseline in tests/unit/bench/baseline/
//                               (or PATINS_BENCH_BASELINE=<file name>); FAILS if any metric is outside
//                               its tolerance, appeared or disappeared.
//   npm run bench:feel:write  → (PATINS_BENCH_WRITE=1) writes baseline/feel-v<package.json version>.json
//                               and prints the comparison with the previous baseline (never fails).
interface NodeFs {
  existsSync(p: URL): boolean;
  readdirSync(p: URL): string[];
  readFileSync(p: URL, encoding: 'utf-8'): string;
  writeFileSync(p: URL, data: string): void;
  mkdirSync(p: URL, options: { recursive: boolean }): unknown;
}
const proc = (globalThis as { process?: { env: Record<string, string | undefined>; getBuiltinModule?: (id: string) => unknown } }).process;
const env = proc?.env ?? {};
const run = env.PATINS_BENCH ? describe : describe.skip;

const BASELINE_DIR = new URL('./baseline/', import.meta.url);
const FILE = /^feel-v(\d+)\.(\d+)\.(\d+)\.json$/;

/** The newest baseline file name (by version), or null. */
function newestBaseline(fs: NodeFs): string | null {
  if (!fs.existsSync(BASELINE_DIR)) return null;
  const files = fs.readdirSync(BASELINE_DIR).filter((f) => FILE.test(f));
  const ver = (f: string): number[] => FILE.exec(f)!.slice(1).map(Number);
  files.sort((a, b) => {
    const va = ver(a);
    const vb = ver(b);
    return va[0]! - vb[0]! || va[1]! - vb[1]! || va[2]! - vb[2]!;
  });
  return files.at(-1) ?? null;
}

run('feel regression (pass, shot, volley, rebounds) vs the baseline', () => {
  it('every metric is within its tolerance of the baseline', { timeout: 1800000 }, () => {
    const fs = proc!.getBuiltinModule!('node:fs') as NodeFs;
    const version = (JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8')) as { version: string }).version;
    const t0 = performance.now();
    const now = collectFeelMetrics((name, n, s) => console.log(`SECTION ${name.padEnd(46)} ${String(n).padStart(3)} metrics ${s.toFixed(1).padStart(6)} s`));
    console.log(`TOTAL ${Object.keys(now).length} metrics in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

    const name = env.PATINS_BENCH_BASELINE ?? newestBaseline(fs);
    const base: Baseline | null = name && fs.existsSync(new URL(name, BASELINE_DIR)) ? (JSON.parse(fs.readFileSync(new URL(name, BASELINE_DIR), 'utf-8')) as Baseline) : null;
    const rows = base ? compareMetrics(base.metrics, now) : [];
    if (base) {
      console.log(`\nBASELINE ${name} (v${base.version}) vs now (v${version})\n${formatTable(rows)}`);
      const counts = { same: 0, within: 0, CHANGED: 0, NEW: 0, GONE: 0 };
      for (const r of rows) counts[r.status]++;
      console.log(`\nSUMMARY identical ${counts.same} | changed within tolerance ${counts.within} | outside tolerance ${counts.CHANGED} | new ${counts.NEW} | gone ${counts.GONE}`);
      const bad = rows.filter(isFlagged);
      if (bad.length) console.log(`FLAGGED\n${formatTable(bad)}`);
    }

    if (env.PATINS_BENCH_WRITE) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      const out = new URL(`feel-v${version}.json`, BASELINE_DIR);
      fs.writeFileSync(out, baselineToJson({ version, metrics: now }));
      console.log(`WROTE tests/unit/bench/baseline/feel-v${version}.json (${Object.keys(now).length} metrics)`);
      return;
    }
    expect(base, `no baseline in tests/unit/bench/baseline (${name ?? 'none'}): run npm run bench:feel:write`).not.toBeNull();
    const flagged = rows.filter(isFlagged).map((r) => `${r.key}: ${r.status} ${r.base ?? '-'} → ${r.now ?? '-'}`);
    expect(flagged, 'feel metrics outside their tolerance (if the change is intended: npm run bench:feel:write and say so in the PR)').toEqual([]);
  });
});
