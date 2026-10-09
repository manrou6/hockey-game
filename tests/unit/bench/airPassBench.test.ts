import { describe, it } from 'vitest';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { createWorld, stepWorld, type WorldState } from '../../../src/sim/world';

// Driven lofted pass and lob to a teammate, single passes by the REAL passer-receiver distance
// (F1.5e: the driven pass arrives in the air up to pass.driveAirFull; beyond, the v0.1.27 pass).
// The receiver gets the control as the pass leaves and the human leaves the stick alone; aiming
// error ±0.12 rad; Mitjana. has % / clean % and how each one ended (high = taken in the air).
// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench/airPassBench
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const cmd = (x = 0, y = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), moveX: x, moveY: y, ...extra });

const BINS = [5, 8, 12, 14, 16, 17, 18, 19, 20, 25, 36];

run('air pass bench (F1.5e)', () => {
  it('single driven lofted passes and lobs by real distance: has / clean', { timeout: 900000 }, () => {
    const t: Tuning = structuredClone(TUNING);
    for (const height of [1, 2]) {
      const has = BINS.map(() => 0);
      const clean = BINS.map(() => 0);
      const n = BINS.map(() => 0);
      const why: Record<string, number>[] = BINS.map(() => ({}));
      for (let seed = 1; seed <= 1200; seed++) {
        const rnd = lcg(seed * 7 + 3);
        const w = createWorld(seed, 2);
        w.assist = 'medium' as WorldState['assist'];
        const step = (c: PlayerCommand): void => stepWorld(w, [c], t);
        for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(cmd(0.5, 0));
        for (let i = 0; i < 60; i++) step(cmd());
        const p = w.players[0]!;
        const r = w.players[1]!;
        const dist = 5 + rnd() * 30;
        const ang = rnd() * 1.4 - 0.7 + (seed % 2 ? 0.3 : -0.3);
        p.x = p.prevX = -18 + rnd() * 4;
        p.y = p.prevY = rnd() * 6 - 3;
        w.ball.x = w.ball.prevX = p.x + 0.5;
        w.ball.y = w.ball.prevY = p.y - 0.2;
        r.x = r.prevX = Math.min(18, p.x + Math.cos(ang) * dist);
        r.y = r.prevY = Math.max(-8, Math.min(8, p.y + Math.sin(ang) * dist));
        const o = w.players[2]!;
        o.x = o.prevX = Math.max(-19, p.x - 6);
        o.y = o.prevY = p.y;
        const real = Math.hypot(r.x - p.x, r.y - p.y);
        const b = BINS.findIndex((x, i) => real >= x && real < (BINS[i + 1] ?? 99));
        if (b < 0 || b >= BINS.length - 1) continue;
        const a = Math.atan2(r.y - p.y, r.x - p.x) + (rnd() * 2 - 1) * 0.12;
        step(cmd(Math.cos(a), Math.sin(a), { pass: true, passHeight: height }));
        const t0 = w.tick;
        let outcome = -1;
        let high = false;
        for (let i = 0; i < 240 && w.ball.owner !== 1; i++) {
          step(cmd());
          if (w.lastHighPlayer === 1 && w.lastHighTick >= t0) high = true;
          if (outcome < 0 && w.lastReceptionTick >= t0 && w.lastReceptionPlayer === 1) outcome = w.lastReceptionOutcome;
        }
        n[b]!++;
        if (w.ball.owner === 1) has[b]!++;
        if (outcome === 0) clean[b]!++;
        const key = w.ball.owner === 1 ? (high ? 'high-ok' : 'ok') : `${high ? 'high-' : ''}${outcome < 0 ? 'none' : outcome}`;
        why[b]![key] = (why[b]![key] ?? 0) + 1;
      }
      const cols = BINS.slice(0, -1).map((x, i) => `${x}-${BINS[i + 1]} m (${n[i]}) ${((100 * has[i]!) / n[i]!).toFixed(0)}/${((100 * clean[i]!) / n[i]!).toFixed(0)} ${JSON.stringify(why[i])}`);
      console.log(`SGL ${height === 1 ? 'driven' : 'lob   '} | ${cols.join(' | ')}`);
    }
  });
});
