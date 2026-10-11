import { describe, it } from 'vitest';
import { TUNING } from '../../../src/config/tuning';
import { goalLineX } from '../../../src/config/rink';
import { createBall, stepBall, type BallEvent } from '../../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { pickupDistance, pressureOn } from '../../../src/sim/dribble';
import { findReceiver } from '../../../src/sim/mates';
import { createPassPlan, PASS_DRIVE, PASS_GROUND, PASS_LOB, planPass, type PassKind } from '../../../src/sim/pass';
import { collidePlayers, stepPlayer } from '../../../src/sim/player';
import { createRng } from '../../../src/sim/rng';
import { createShotPlan, planShot, SHOT_CHIP, SHOT_HIGH, SHOT_LOW, type ShotKind } from '../../../src/sim/shot';
import { createVolleyContact, predictContact } from '../../../src/sim/volley';
import { createWorld, stepWorld, type WorldState } from '../../../src/sim/world';
import { createAiMem, createStressWorld, fmt, humanCommands, lcg, stressCommands, summarize } from './perfBench';

// Performance bench of the simulation (§C of docs/AUDITORIA_F1.md → docs/audit/C.md).
// Benchmarks (not assertions), noisy on a shared machine: repeat and take the median.
// PATINS_BENCH=1 npx vitest run tests/unit/bench/perfBench.test.ts --reporter=verbose --maxWorkers=1
// Lines: TICK (µs per stepWorld tick, by world), TICKCAT (by what happened in the tick),
// ACT (what the bench did per minute), CALL (µs per call of the expensive predictions),
// ARROW (tick cost while PASE is held: the pass arrow re-plans every tick), ALLOC (bytes
// allocated per tick), PROF (CPU profile of the stress world: top self / total time).
// Node built-ins through process.getBuiltinModule (tsconfig has no Node types, as feelRegression).
interface Proc {
  env: Record<string, string | undefined>;
  getBuiltinModule?: (id: string) => unknown;
  memoryUsage(): { heapUsed: number };
}
interface InspectorSession {
  connect(): void;
  disconnect(): void;
  post(method: string, params?: object): Promise<any>;
}
interface GcReport {
  statistics: { gcType: string; cost: number; beforeGC: { heapStatistics: { usedHeapSize: number } }; afterGC: { heapStatistics: { usedHeapSize: number } } }[];
}
const proc = (globalThis as { process?: Proc }).process;
const builtin = <T>(id: string): T => proc!.getBuiltinModule!(id) as T;
const run = proc?.env.PATINS_BENCH ? describe : describe.skip;

const SEEDS = 6;
/** One minute of play per seed (60 Hz). */
const TICKS = 3600;
const WARMUP = 3000;

type Kind = 'current' | 'stress';

interface RunResult {
  ticks: Float64Array;
  ai: Float64Array;
  /** Per-tick category: 0 normal, 1 arrow (PASE held with the ball), 2 pass leaves, 3 shot leaves, 4 shot reticle only. */
  cat: Uint8Array;
  passKinds: number[];
  shots: number;
  receptions: number;
  looseTicks: number;
  players: number;
}

function newWorld(kind: Kind, seed: number): WorldState {
  return kind === 'current' ? createWorld(seed, 2) : createStressWorld(seed);
}

function runWorld(kind: Kind, seed: number, ticks: number, measure: boolean): RunResult {
  const w = newWorld(kind, seed);
  const cmds: PlayerCommand[] = w.players.map(() => emptyCommand());
  const mem = createAiMem(w.players.length);
  const rnd = lcg(seed * 7919 + 17);
  const res: RunResult = { ticks: new Float64Array(ticks), ai: new Float64Array(ticks), cat: new Uint8Array(ticks), passKinds: [0, 0, 0], shots: 0, receptions: 0, looseTicks: 0, players: w.players.length };
  let lastRec = w.lastReceptionTick;
  for (let t = 0; t < ticks; t++) {
    const a0 = performance.now();
    if (kind === 'current') humanCommands(w, cmds, mem, rnd);
    else stressCommands(w, cmds, mem, rnd);
    const t0 = performance.now();
    const owner = w.ball.owner;
    stepWorld(w, cmds, TUNING);
    const t1 = performance.now();
    if (!measure) continue;
    res.ai[t] = (t0 - a0) * 1000;
    res.ticks[t] = (t1 - t0) * 1000;
    let c = 0;
    if (w.lastShotTick === w.tick - 1) {
      c = 3;
      res.shots++;
    } else if (owner >= 0 && w.ball.owner < 0 && w.passFrom === owner) {
      c = 2;
      res.passKinds[w.passKind]!++;
    } else if (w.aimActive) c = 1;
    else if (w.shotAimActive) c = 4;
    res.cat[t] = c;
    if (w.ball.owner < 0) res.looseTicks++;
    if (w.lastReceptionTick !== lastRec) {
      res.receptions++;
      lastRec = w.lastReceptionTick;
    }
  }
  return res;
}

function concat(parts: Float64Array[]): Float64Array {
  const out = new Float64Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** µs per call: median of `batches` batches of `n` calls. */
function perCall(n: number, batches: number, f: (i: number) => void): number {
  const r: number[] = [];
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) f(i);
    r.push(((performance.now() - t0) * 1000) / n);
  }
  r.sort((a, b) => a - b);
  return r[Math.floor(r.length / 2)]!;
}

const CAT_NAMES = ['normal', 'arrow (PASE held)', 'pass leaves', 'shot leaves', 'shot reticle'];

run('performance bench (§C)', () => {
  it('sim cost per tick: current world (3 players) and stress world (10 entities)', { timeout: 900000 }, () => {
    for (const kind of ['current', 'stress'] as const) {
      runWorld(kind, 999, WARMUP, false);
      const parts: RunResult[] = [];
      for (let s = 1; s <= SEEDS; s++) parts.push(runWorld(kind, s, TICKS, true));
      const all = concat(parts.map((p) => p.ticks));
      const ai = concat(parts.map((p) => p.ai));
      console.log(`TICK ${kind} players=${parts[0]!.players} ${fmt(summarize(all))}`);
      console.log(`TICK ${kind} test-AI (not counted above) ${fmt(summarize(ai))}`);
      // Per seed, to see the spread.
      console.log(`TICK ${kind} per-seed mean/p95/max: ${parts.map((p) => { const s = summarize(p.ticks); return `${s.mean.toFixed(1)}/${s.p95.toFixed(1)}/${s.max.toFixed(0)}`; }).join('  ')}`);
      const cat = new Uint8Array(all.length);
      let o = 0;
      for (const p of parts) {
        cat.set(p.cat, o);
        o += p.cat.length;
      }
      for (let c = 0; c < CAT_NAMES.length; c++) {
        const sel: number[] = [];
        for (let i = 0; i < all.length; i++) if (cat[i] === c) sel.push(all[i]!);
        if (sel.length) console.log(`TICKCAT ${kind} ${CAT_NAMES[c]}: ${fmt(summarize(Float64Array.from(sel)))}`);
      }
      const minutes = (SEEDS * TICKS) / 3600;
      const pk = [0, 1, 2].map((k) => parts.reduce((s, p) => s + p.passKinds[k]!, 0) / minutes);
      const sh = parts.reduce((s, p) => s + p.shots, 0) / minutes;
      const rec = parts.reduce((s, p) => s + p.receptions, 0) / minutes;
      const loose = parts.reduce((s, p) => s + p.looseTicks, 0) / (SEEDS * TICKS);
      console.log(`ACT ${kind} per minute: passes ground ${pk[0]!.toFixed(0)} / driven ${pk[1]!.toFixed(0)} / lob ${pk[2]!.toFixed(0)}, shots ${sh.toFixed(0)}, receptions ${rec.toFixed(0)}, loose ball ${(loose * 100).toFixed(0)} % of ticks`);
    }
  });

  it('same micro-bench as __PATINS__.benchSim (to compare Node with Chromium)', () => {
    const one = (): number => {
      const w = createWorld(7, 2);
      const c = emptyCommand();
      c.moveX = 1;
      c.moveY = 0.3;
      c.sprint = true;
      const cmds = [c];
      const t0 = performance.now();
      for (let i = 0; i < 3000; i++) {
        if (i % 90 === 0) c.moveY = -c.moveY;
        stepWorld(w, cmds, TUNING);
      }
      return ((performance.now() - t0) * 1000) / 3000;
    };
    for (let i = 0; i < 5; i++) one();
    const r = [one(), one(), one(), one(), one()].sort((a, b) => a - b);
    console.log(`BENCHSIM node: ${r.map((x) => x.toFixed(1)).join(' ')} µs/tick (median ${r[2]!.toFixed(1)})`);
  });

  it('per-call cost of the expensive predictions', { timeout: 900000 }, () => {
    const w = createWorld(1, 2);
    const players = w.players;
    const p = players[0]!;
    const r = players[1]!;
    const ball = w.ball;
    const cmd = emptyCommand();
    const plan = createPassPlan();
    // planPass: carrier at the origin with the ball, receiver `d` m away at 20°, standing or running across.
    const kinds: [PassKind, string][] = [[PASS_GROUND, 'ground'], [PASS_DRIVE, 'driven'], [PASS_LOB, 'lob']];
    for (const [kind, name] of kinds) {
      for (const charge of [0, 1]) {
        const row: string[] = [];
        for (const d of [6, 10, 16, 25]) {
          for (const running of [false, true]) {
            p.x = 0;
            p.y = 0;
            p.heading = 0;
            p.vx = p.vy = 0;
            ball.owner = 0;
            ball.x = 0.6;
            ball.y = -0.3;
            ball.z = 0.0366;
            ball.vx = ball.vy = ball.vz = 0;
            r.x = Math.cos(0.35) * d;
            r.y = Math.sin(0.35) * d;
            r.vx = 0;
            r.vy = running ? 6 : 0;
            players[2]!.x = -8;
            const aim = Math.atan2(r.y, r.x);
            cmd.moveX = Math.cos(aim);
            cmd.moveY = Math.sin(aim);
            const us = perCall(name === 'ground' ? 40 : 6, 5, () => planPass(players, ball, 0, cmd, 'medium', kind, charge, 1, 0, TUNING, plan));
            row.push(`${d}m${running ? 'R' : ''}=${us.toFixed(0)}`);
          }
        }
        console.log(`CALL planPass ${name} charge=${charge}: ${row.join(' ')} µs`);
      }
    }
    // No receiver, aimed at the side board: the wall-pass planner.
    {
      p.x = 0;
      p.y = 4;
      p.heading = Math.PI / 2;
      cmd.moveX = 0.5;
      cmd.moveY = 0.87;
      const us = [0, 1].map((charge) => perCall(40, 5, () => planPass(players, ball, 0, cmd, 'medium', PASS_GROUND, charge, -1, 0, TUNING, plan)));
      console.log(`CALL planPass ground no target (wall pass) charge 0/1: ${us.map((u) => u.toFixed(0)).join(' / ')} µs`);
      for (const [kind, name] of kinds.slice(1)) {
        const u2 = perCall(10, 5, () => planPass(players, ball, 0, cmd, 'medium', kind, 0.5, -1, 0, TUNING, plan));
        console.log(`CALL planPass ${name} no target charge 0.5: ${u2.toFixed(0)} µs`);
      }
    }
    // planShot: the reticle (every tick while carrying near the goal or charging) and the launch.
    {
      const shot = createShotPlan();
      const gx = goalLineX(1);
      const row: string[] = [];
      for (const [kind, name] of [[SHOT_LOW, 'low'], [SHOT_HIGH, 'high'], [SHOT_CHIP, 'chip']] as [ShotKind, string][]) {
        for (const d of [5, 10, 18]) {
          p.x = gx - d;
          p.y = 1;
          p.heading = 0;
          ball.x = p.x + 0.6;
          ball.y = p.y - 0.3;
          cmd.moveX = 1;
          cmd.moveY = 0;
          const us = perCall(kind === SHOT_LOW ? 2000 : 40, 5, () => planShot(p, ball, cmd, 'medium', kind, 0.5, false, TUNING, shot));
          row.push(`${name}@${d}m=${us.toFixed(1)}`);
        }
      }
      console.log(`CALL planShot ${row.join(' ')} µs`);
    }
    // predictContact (remate en el aire, every tick for the controlled player while the ball is loose).
    {
      const contact = createVolleyContact();
      p.x = 0;
      p.y = 0;
      p.heading = Math.PI;
      p.vx = p.vy = 0;
      ball.owner = -1;
      const cases: [string, number, number, number, number][] = [['air, coming', 8, 0, -12, 3], ['rolling, coming', 8, 0, -10, 0], ['air, moving away', 8, 0, 12, 3], ['slow, far', 15, 5, 1, 0]];
      const row: string[] = [];
      for (const [name, x, y, vx, vz] of cases) {
        const us = perCall(5000, 5, () => {
          ball.x = x;
          ball.y = y;
          ball.z = 0.5;
          ball.vx = vx;
          ball.vy = 0;
          ball.vz = vz;
          predictContact(ball, p, TUNING, contact);
        });
        row.push(`${name}=${us.toFixed(2)}`);
      }
      console.log(`CALL predictContact (lookahead ${TUNING.volley.lookahead} s) ${row.join(' ')} µs`);
    }
    // Per-tick building blocks, with 10 entities.
    {
      const sw = createStressWorld(3);
      const ps = sw.players;
      const b = createBall(0, 0);
      const events: BallEvent[] = [];
      const rng = createRng(5);
      const dt = 1 / TUNING.sim.tickRate;
      const fast = perCall(2000, 5, () => {
        b.x = -5;
        b.y = 0.2;
        b.z = 0.3;
        b.vx = 25;
        b.vy = 1;
        b.vz = 2;
        b.owner = -1;
        events.length = 0;
        stepBall(b, ps, TUNING, rng, dt, events);
      });
      const slow = perCall(5000, 5, () => {
        b.x = 0;
        b.y = 0;
        b.z = 0.0366;
        b.vx = 3;
        b.vy = 0;
        b.vz = 0;
        events.length = 0;
        stepBall(b, ps, TUNING, rng, dt, events);
      });
      console.log(`CALL stepBall 10 players: shot at 25 m/s ${fast.toFixed(2)} µs, rolling at 3 m/s ${slow.toFixed(2)} µs`);
      const pairs = perCall(5000, 5, () => {
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) collidePlayers(ps[i]!, ps[j]!, TUNING);
      });
      console.log(`CALL collidePlayers all 45 pairs (10 entities, spread out): ${pairs.toFixed(2)} µs per tick; ${(pairs / 45 * 1000).toFixed(0)} ns per pair`);
      const c2 = emptyCommand();
      c2.moveX = 0.7;
      c2.moveY = 0.3;
      const sp = perCall(5000, 5, (i) => {
        const q = ps[i % 10]!;
        q.x = (i % 10) - 5;
        q.y = 0;
        stepPlayer(q, c2, TUNING, dt, false);
      });
      console.log(`CALL stepPlayer: ${sp.toFixed(2)} µs per player`);
      b.x = -3;
      b.y = 0;
      b.vx = -12;
      b.vy = 0.5;
      b.owner = -1;
      const fr = perCall(20000, 5, () => findReceiver(ps, b, TUNING));
      const pu = perCall(20000, 5, (i) => pickupDistance(b, ps[i % 10]!, TUNING, 0));
      const pr = perCall(20000, 5, (i) => pressureOn(ps[i % 10]!, ps, TUNING));
      console.log(`CALL findReceiver (10) ${fr.toFixed(2)} µs, pickupDistance ${pu.toFixed(3)} µs per player, pressureOn (10) ${pr.toFixed(2)} µs`);
    }
  });

  it('pass arrow: tick cost while PASE is held with the ball (planPass every tick)', { timeout: 900000 }, () => {
    for (const [height, name] of [[0, 'ground'], [1, 'driven'], [2, 'lob']] as const) {
      const samples: number[] = [];
      const base: number[] = [];
      for (let seed = 1; seed <= 20; seed++) {
        const w = createWorld(seed, 2);
        const c = emptyCommand();
        c.moveX = 0.5;
        for (let i = 0; i < 120 && w.ball.owner !== 0; i++) stepWorld(w, [c], TUNING);
        // Carry a bit (baseline ticks), then hold PASE aimed at teammate 1 for 0.6 s.
        c.moveX = 0.3;
        for (let i = 0; i < 20; i++) {
          const t0 = performance.now();
          stepWorld(w, [c], TUNING);
          if (seed > 2) base.push((performance.now() - t0) * 1000);
        }
        const r = w.players[1]!;
        const me = w.players[w.controlled]!;
        const aim = Math.atan2(r.y - me.y, r.x - me.x);
        const h = emptyCommand();
        h.moveX = Math.cos(aim);
        h.moveY = Math.sin(aim);
        h.pass = true;
        h.passHeld = true;
        h.passHeight = height;
        for (let i = 0; i < 36; i++) {
          const t0 = performance.now();
          stepWorld(w, [h], TUNING);
          const us = (performance.now() - t0) * 1000;
          h.pass = false;
          if (seed > 2 && w.aimActive) samples.push(us);
        }
      }
      console.log(`ARROW ${name}: holding PASE ${fmt(summarize(Float64Array.from(samples)))} | carrying without PASE ${fmt(summarize(Float64Array.from(base)))}`);
    }
  });

  it('allocations and GC per tick (v8.GCProfiler: exact bytes, scavenges and their cost)', { timeout: 900000 }, () => {
    const { GCProfiler } = builtin<{ GCProfiler: new () => { start(): void; stop(): GcReport } }>('node:v8');
    const measure = (name: string, ticks: number, step: () => void): void => {
      const prof = new GCProfiler();
      const h0 = proc!.memoryUsage().heapUsed;
      prof.start();
      for (let i = 0; i < ticks; i++) step();
      const h1 = proc!.memoryUsage().heapUsed;
      const rep = prof.stop();
      let freed = 0;
      let cost = 0;
      let scav = 0;
      let maxCost = 0;
      for (const g of rep.statistics) {
        freed += g.beforeGC.heapStatistics.usedHeapSize - g.afterGC.heapStatistics.usedHeapSize;
        cost += g.cost;
        maxCost = Math.max(maxCost, g.cost);
        if (g.gcType === 'Scavenge' || g.gcType === 'MinorMarkSweep') scav++;
      }
      const bytes = h1 - h0 + freed;
      console.log(`ALLOC ${name}: ${(bytes / ticks).toFixed(0)} bytes/tick (${((bytes / ticks) * 60 / 1e6).toFixed(2)} MB/s at 60 Hz), ${rep.statistics.length} GCs (${scav} minor) in ${ticks} ticks = ${((rep.statistics.length / ticks) * 3600).toFixed(0)} per minute, GC cost ${(cost / ticks).toFixed(2)} µs/tick, worst GC ${maxCost.toFixed(0)} µs`);
    };
    for (const kind of ['current', 'stress'] as const) {
      runWorld(kind, 998, WARMUP, false);
      const w = newWorld(kind, 4);
      const cmds: PlayerCommand[] = w.players.map(() => emptyCommand());
      const mem = createAiMem(w.players.length);
      const rnd = lcg(77);
      measure(`${kind} world, test AI included`, 6 * TICKS, () => {
        if (kind === 'current') humanCommands(w, cmds, mem, rnd);
        else stressCommands(w, cmds, mem, rnd);
        stepWorld(w, cmds, TUNING);
      });
    }
    // The test AI alone (to subtract): commands only, the world frozen.
    {
      const w = createStressWorld(4);
      const cmds: PlayerCommand[] = w.players.map(() => emptyCommand());
      const mem = createAiMem(w.players.length);
      const rnd = lcg(77);
      measure('stress test AI alone (world frozen)', TICKS, () => stressCommands(w, cmds, mem, rnd));
    }
    // Carrying the ball without and with PASE held (the pass arrow re-plans each tick).
    for (const [height, name] of [[-1, 'carrying'], [0, 'PASE held ground'], [1, 'PASE held driven'], [2, 'PASE held lob']] as const) {
      const w = createWorld(3, 2);
      const c = emptyCommand();
      c.moveX = 0.5;
      for (let i = 0; i < 120 && w.ball.owner !== 0; i++) stepWorld(w, [c], TUNING);
      const r = w.players[1]!;
      const me = w.players[w.controlled]!;
      const aim = Math.atan2(r.y - me.y, r.x - me.x);
      const h = emptyCommand();
      h.moveX = Math.cos(aim) * 0.3;
      h.moveY = Math.sin(aim) * 0.3;
      if (height >= 0) {
        h.pass = true;
        h.passHeld = true;
        h.passHeight = height;
      }
      stepWorld(w, [h], TUNING);
      h.pass = false;
      measure(name, 30, () => stepWorld(w, [h], TUNING));
    }
  });

  it('what-if (NOT applied to src): Math.hypot replaced by Math.sqrt in the whole sim', { timeout: 900000 }, () => {
    // Math.hypot is a variadic V8 builtin that TurboFan does not inline: every call allocates a
    // small array and a boxed result. Patch it for this test only, measure, restore.
    const w = createWorld(1, 2);
    const players = w.players;
    const p = players[0]!;
    const r = players[1]!;
    const ball = w.ball;
    const cmd = emptyCommand();
    const plan = createPassPlan();
    const { GCProfiler } = builtin<{ GCProfiler: new () => { start(): void; stop(): GcReport } }>('node:v8');
    const measure = (): string => {
      const out: string[] = [];
      for (const [kind, name] of [[PASS_GROUND, 'ground'], [PASS_DRIVE, 'driven'], [PASS_LOB, 'lob']] as [PassKind, string][]) {
        p.x = 0;
        p.y = 0;
        p.heading = 0;
        ball.owner = 0;
        ball.x = 0.6;
        ball.y = -0.3;
        r.x = Math.cos(0.35) * 12;
        r.y = Math.sin(0.35) * 12;
        r.vx = r.vy = 0;
        cmd.moveX = Math.cos(0.35);
        cmd.moveY = Math.sin(0.35);
        const call = (): void => {
          planPass(players, ball, 0, cmd, 'medium', kind, 0, 1, 0, TUNING, plan);
        };
        const us = perCall(kind === PASS_GROUND ? 40 : 8, 7, call);
        const prof = new GCProfiler();
        const h0 = proc!.memoryUsage().heapUsed;
        prof.start();
        for (let i = 0; i < 20; i++) call();
        const h1 = proc!.memoryUsage().heapUsed;
        const rep = prof.stop();
        const freed = rep.statistics.reduce((a, g) => a + g.beforeGC.heapStatistics.usedHeapSize - g.afterGC.heapStatistics.usedHeapSize, 0);
        out.push(`${name}@12m ${us.toFixed(0)} µs ${((h1 - h0 + freed) / 20 / 1024).toFixed(0)} KB/call`);
      }
      const sw = createStressWorld(2);
      const cmds: PlayerCommand[] = sw.players.map(() => emptyCommand());
      const mem = createAiMem(sw.players.length);
      const rnd = lcg(5);
      for (let i = 0; i < 1500; i++) {
        stressCommands(sw, cmds, mem, rnd);
        stepWorld(sw, cmds, TUNING);
      }
      const normal: number[] = [];
      for (let i = 0; i < 6000; i++) {
        stressCommands(sw, cmds, mem, rnd);
        const t0 = performance.now();
        stepWorld(sw, cmds, TUNING);
        const us = (performance.now() - t0) * 1000;
        if (!sw.aimActive && us < 100) normal.push(us);
      }
      normal.sort((a, b) => a - b);
      out.push(`stress normal tick p50 ${normal[Math.floor(normal.length / 2)]!.toFixed(1)} µs`);
      return out.join(' | ');
    };
    const orig = Math.hypot;
    measure();
    const before = measure();
    try {
      (Math as { hypot: (...v: number[]) => number }).hypot = function (a: number, b: number, c?: number): number {
        return c === undefined ? Math.sqrt(a * a + b * b) : Math.sqrt(a * a + b * b + c * c);
      } as (...v: number[]) => number;
      measure();
      const after = measure();
      console.log(`WHATIF Math.hypot (today): ${before}`);
      console.log(`WHATIF Math.sqrt instead : ${after}`);
    } finally {
      (Math as { hypot: typeof orig }).hypot = orig;
    }
  });

  it('CPU profile of the stress world (top self time, total time of sim functions)', { timeout: 900000 }, async () => {
    const { Session } = builtin<{ Session: new () => InspectorSession }>('node:inspector/promises');
    const session = new Session();
    session.connect();
    await session.post('Profiler.enable');
    await session.post('Profiler.setSamplingInterval', { interval: 100 });
    runWorld('stress', 999, WARMUP, false);
    const c0 = performance.now();
    for (let s = 1; s <= SEEDS; s++) runWorld('stress', s, TICKS, false);
    const clean = performance.now() - c0;
    await session.post('Profiler.start');
    const p0 = performance.now();
    for (let s = 1; s <= SEEDS; s++) runWorld('stress', s, TICKS, false);
    const profiled = performance.now() - p0;
    const { profile } = await session.post('Profiler.stop');
    // Then (separately) sample allocations, short-lived ones too, to see who allocates.
    await session.post('HeapProfiler.enable');
    await session.post('HeapProfiler.startSampling', { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    for (let s = 1; s <= SEEDS; s++) runWorld('stress', s, TICKS, false);
    const { profile: heap } = await session.post('HeapProfiler.stopSampling');
    session.disconnect();
    console.log(`PROF stress run: ${(clean * 1000 / (SEEDS * TICKS)).toFixed(1)} µs/tick without the profiler, ${(profiled * 1000 / (SEEDS * TICKS)).toFixed(1)} µs/tick while profiling (both incl. the test AI and timers): use the percentages`);
    type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] };
    const nodes = profile.nodes as Node[];
    const byId = new Map<number, Node>();
    const parent = new Map<number, number>();
    for (const n of nodes) {
      byId.set(n.id, n);
      for (const c of n.children ?? []) parent.set(c, n.id);
    }
    const key = (n: Node): string => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}`;
    const self = new Map<string, number>();
    const total = new Map<string, number>();
    let all = 0;
    const samples = profile.samples ?? [];
    const deltas = profile.timeDeltas ?? [];
    for (let i = 0; i < samples.length; i++) {
      const dt = deltas[i] ?? 0;
      let n = byId.get(samples[i]!)!;
      all += dt;
      self.set(key(n), (self.get(key(n)) ?? 0) + dt);
      const seen = new Set<string>();
      for (;;) {
        const k = key(n);
        if (!seen.has(k)) {
          seen.add(k);
          total.set(k, (total.get(k) ?? 0) + dt);
        }
        const pid = parent.get(n.id);
        if (pid === undefined) break;
        n = byId.get(pid)!;
      }
    }
    const ticks = SEEDS * TICKS;
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
    
    for (const [k, v] of top) console.log(`PROF self ${((v / all) * 100).toFixed(1)} % ≈ ${((v / all) * clean * 1000 / ticks).toFixed(2)} µs/tick ${k}`);
    const simTotal = [...total.entries()].filter(([k]) => k.includes(' sim/')).sort((a, b) => b[1] - a[1]).slice(0, 30);
    for (const [k, v] of simTotal) console.log(`PROF total ${((v / all) * 100).toFixed(1)} % ≈ ${((v / all) * clean * 1000 / ticks).toFixed(2)} µs/tick ${k}`);
    // Allocation sampling: self bytes per function (all objects, also the ones already collected).
    type HNode = { callFrame: { functionName: string; url: string }; selfSize: number; children: HNode[] };
    const alloc = new Map<string, number>();
    let allocAll = 0;
    const walk = (h: HNode): void => {
      const k = `${h.callFrame.functionName || '(anon)'} ${h.callFrame.url.split('/').slice(-2).join('/')}`;
      alloc.set(k, (alloc.get(k) ?? 0) + h.selfSize);
      allocAll += h.selfSize;
      for (const c of h.children) walk(c);
    };
    walk((heap as { head: HNode }).head);
    console.log(`PROF alloc: ~${(allocAll / ticks).toFixed(0)} bytes/tick sampled (all functions, incl. test AI and vitest)`);
    for (const [k, v] of [...alloc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`PROF alloc ${(v / ticks).toFixed(1)} B/tick ${k}`);
  });
});
