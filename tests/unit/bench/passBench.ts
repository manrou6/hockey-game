import { TUNING, type Tuning } from '../../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { createWorld, stepWorld, type WorldState } from '../../../src/sim/world';

// Passing test bench (F1.4d): a scripted "human" plays chains of passes between the 3 players of
// the test bench and measures where the time goes. Deterministic (seeded). Run with
//   PATINS_BENCH=1 npx vitest run tests/unit/bench
// Not part of the normal test run (see passBench.test.ts).

const TICK = 1 / 60;

export interface HumanPolicy {
  /** Seconds after getting the ball before PASE is pressed (human reaction). */
  reaction: number;
  /** Seconds PASE is held down for a tap (touch down → up). */
  tapDuration: number;
  /** First touch: press so that the pass is released just as the ball arrives (no reaction time). */
  firstTouch: boolean;
  /** Aiming error of the human (±rad, uniform). */
  aimError: number;
}

export const REACTIVE: HumanPolicy = { reaction: 0.25, tapDuration: 0.1, firstTouch: false, aimError: 0.12 };
export const FIRST_TOUCH: HumanPolicy = { reaction: 0, tapDuration: 0.1, firstTouch: true, aimError: 0.12 };
/** A perfect human: no reaction, one-tick tap. Isolates what the simulation itself costs. */
export const IDEAL: HumanPolicy = { reaction: 0, tapDuration: TICK, firstTouch: false, aimError: 0.12 };

const cmd = (x = 0, y = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), moveX: x, moveY: y, ...extra });

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export interface PassRecord {
  ok: boolean;
  /** Seconds from the receiver getting the ball to the next pass leaving (policy-dependent). */
  reactionToRelease: number;
  /** Seconds from release to the target getting the ball. */
  flight: number;
  /** Seconds the ball spent within 1.5 m of the receiver before he got it (positioning/timing loss). */
  waiting: number;
  distance: number;
  /** 0 clean, 1 heavy, 2 rebound, 3 miss (of the reception of this pass). */
  outcome: number;
  /** Receiver speed at the release (m/s). */
  targetSpeed: number;
  /** At the pickup: receiver's speed (m/s) and how far his heading is from the next target (deg). */
  pickupSpeed: number;
  pickupTurn: number;
  /** Was it fired at the first touch (buffered press / within the first-touch window)? */
  firstTouch: boolean;
}

export let lastWorld: WorldState | null = null;
export const hooks: { onTick?: (w: WorldState, c: PlayerCommand) => void } = {};

export interface ChainResult {
  passes: PassRecord[];
  completed: boolean;
  /** Why the chain stopped: 'done', 'no-reception' (the ball never reached the receiver's zone),
   * 'bad-reception' (rebound / went past) or 'timeout'. */
  stopped: 'done' | 'no-reception' | 'bad-reception' | 'timeout';
  /** Seconds from the first release to the last pickup (NaN if not completed). */
  total: number;
}

/** Take the ball with the human, let the teammates reach their spots, then play `count` passes. */
export function runChain(seed: number, tuning: Tuning, level: string, policy: HumanPolicy, count = 5): ChainResult {
  const rnd = lcg(seed * 7919 + 13);
  const t = tuning;
  const w = createWorld(seed, 2);
  lastWorld = w;
  w.assist = level as WorldState['assist'];
  const step = (c: PlayerCommand): void => stepWorld(w, [c], t);
  for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(cmd(0.5, 0));
  for (let i = 0; i < 150; i++) step(cmd());

  const holdTicks = Math.max(1, Math.round(policy.tapDuration / TICK));
  const reactionTicks = Math.round(policy.reaction / TICK);
  const passes: PassRecord[] = [];
  // Per pass in flight.
  let cur: { from: number; target: number; release: number; distance: number; targetSpeed: number; nearTicks: number; sinceCarry: number } | null = null;
  let prevPasser = -1;
  let carrySince = w.tick; // tick the controlled player got the ball
  let seq: { start: number; ax: number; ay: number } | null = null;
  let lastPassTick = w.lastPassTick;
  let lastRecTick = w.lastReceptionTick;
  let firstRelease = -1;
  let lastPickup = -1;
  let stopped: ChainResult['stopped'] = 'timeout';
  let nextTarget = -1;
  const pickups: number[] = [];
  const releases: number[] = [];
  const chooseTarget = (me: number): number => {
    const others = w.players.map((_, i) => i).filter((i) => i !== me && i !== prevPasser);
    if (prevPasser < 0) {
      let best = others[0]!;
      let bd = Infinity;
      for (const i of others) {
        const d = Math.hypot(w.players[i]!.x - w.players[me]!.x, w.players[i]!.y - w.players[me]!.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    }
    return others[0]!;
  };
  const aimAt = (target: number): { ax: number; ay: number } => {
    const r = w.players[target]!;
    const a = Math.atan2(r.y - w.ball.y, r.x - w.ball.x) + (rnd() * 2 - 1) * policy.aimError;
    return { ax: Math.cos(a), ay: Math.sin(a) };
  };

  for (let guard = 0; guard < 60 * 40 && passes.length < count; guard++) {
    const me = w.controlled;
    let c = cmd();
    // 1) Carrying: wait the reaction time, then tap.
    if (w.ball.owner === me && !seq) {
      if (nextTarget < 0) nextTarget = chooseTarget(me);
      if (w.tick - carrySince >= reactionTicks) seq = { start: w.tick, ...aimAt(nextTarget) };
    }
    // 2) First touch: while the ball travels to the (already controlled) receiver, press early
    //    so that the tap ends as the ball arrives.
    if (policy.firstTouch && cur && !seq && w.ball.owner !== me && w.controlled === cur.target) {
      const r = w.players[cur.target]!;
      const dx = r.x - w.ball.x;
      const dy = r.y - w.ball.y;
      const dist = Math.hypot(dx, dy);
      const closing = (w.ball.vx * dx + w.ball.vy * dy) / Math.max(1e-6, dist) - (r.vx * dx + r.vy * dy) / Math.max(1e-6, dist);
      const eta = closing > 0.5 ? Math.max(0, dist - 0.5) / closing : Infinity;
      if (eta <= policy.tapDuration + TICK) {
        const tgt = w.players.map((_, i) => i).filter((i) => i !== cur!.target && i !== cur!.from)[0]!;
        seq = { start: w.tick, ...aimAt(tgt) };
        nextTarget = tgt;
      }
    }
    if (seq) {
      const k = w.tick - seq.start;
      c = cmd(seq.ax, seq.ay, { pass: k === 0, passHeld: k < holdTicks - 1 });
      if (k >= holdTicks - 1) seq = null;
    }
    if (cur && Math.hypot(w.players[cur.target]!.x - w.ball.x, w.players[cur.target]!.y - w.ball.y) < 1.5 && w.ball.owner < 0) cur.nearTicks++;
    step(c);
    hooks.onTick?.(w, c);

    // Events of this tick (a first-touch pass is released on the very tick of the pickup, so the
    // pickup is handled first).
    if (w.lastReceptionTick !== lastRecTick) {
      lastRecTick = w.lastReceptionTick;
      if (cur && cur.release >= 0 && w.lastReceptionPlayer === cur.target) {
        const out = w.lastReceptionOutcome;
        const got = out === 0 || out === 1;
        passes.push({
          ok: got,
          reactionToRelease: Number.NaN,
          flight: (w.tick - cur.release) * TICK,
          waiting: cur.nearTicks * TICK,
          distance: cur.distance,
          outcome: out,
          targetSpeed: cur.targetSpeed,
          pickupSpeed: Math.hypot(w.players[cur.target]!.vx, w.players[cur.target]!.vy),
          pickupTurn: (() => {
            const rp = w.players[cur.target]!;
            const nx = w.players.map((_, i) => i).filter((i) => i !== cur!.target && i !== cur!.from)[0]!;
            const np = w.players[nx]!;
            const d = Math.atan2(np.y - rp.y, np.x - rp.x) - rp.heading;
            return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * (180 / Math.PI);
          })(),
          firstTouch: false,
        });
        if (!got) {
          stopped = 'bad-reception';
          break;
        }
        pickups.push(w.tick);
        lastPickup = w.tick;
        carrySince = w.tick;
        cur = null;
      }
    }
    if (w.lastPassTick !== lastPassTick) {
      lastPassTick = w.lastPassTick;
      if (firstRelease < 0) firstRelease = w.tick;
      releases.push(w.tick);
      const from = w.passFrom >= 0 ? w.passFrom : me;
      const target = nextTarget >= 0 ? nextTarget : w.passTo;
      const r = w.players[target]!;
      cur = { from, target, release: w.tick, distance: Math.hypot(r.x - w.players[from]!.x, r.y - w.players[from]!.y), targetSpeed: Math.hypot(r.vx, r.vy), nearTicks: 0, sinceCarry: 0 };
      prevPasser = from;
      nextTarget = -1;
    }
  }
  // Reaction → release: time between each pickup and the next release (first touch ≈ 0).
  for (let i = 0; i < passes.length - 1; i++) if (releases[i + 1] !== undefined) passes[i]!.reactionToRelease = (releases[i + 1]! - pickups[i]!) * TICK;
  const completed = passes.length === count && passes.every((p) => p.ok);
  if (completed) stopped = 'done';
  else if (stopped === 'timeout' && cur && cur.release >= 0) stopped = 'no-reception';
  const res: ChainResult = { passes, completed, stopped, total: Number.NaN };
  if (res.completed && firstRelease >= 0 && lastPickup >= 0) res.total = (lastPickup - firstRelease) * TICK;
  return res;
}

export interface Summary {
  n: number;
  completedPct: number;
  totalMean: number;
  totalP50: number;
  totalP90: number;
  passOkPct: number;
  cleanPct: number;
  flightMean: number;
  reactionMean: number;
  waitingMean: number;
  distanceMean: number;
  targetSpeedMean: number;
  pickupSpeedMean: number;
  pickupTurnMean: number;
  noReceptionPct: number;
  badReceptionPct: number;
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);
const pct = (a: number[], q: number): number => {
  if (!a.length) return Number.NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

export function summarize(results: ChainResult[]): Summary {
  const done = results.filter((r) => r.completed);
  const all = results.flatMap((r) => r.passes);
  return {
    n: results.length,
    completedPct: (100 * done.length) / results.length,
    totalMean: mean(done.map((r) => r.total)),
    totalP50: pct(done.map((r) => r.total), 0.5),
    totalP90: pct(done.map((r) => r.total), 0.9),
    passOkPct: (100 * all.filter((p) => p.ok).length) / Math.max(1, all.length),
    cleanPct: (100 * all.filter((p) => p.ok && p.outcome === 0).length) / Math.max(1, all.filter((p) => p.ok).length),
    flightMean: mean(all.filter((p) => p.ok).map((p) => p.flight)),
    reactionMean: mean(all.filter((p) => p.ok && !Number.isNaN(p.reactionToRelease)).map((p) => p.reactionToRelease)),
    waitingMean: mean(all.filter((p) => p.ok).map((p) => p.waiting)),
    distanceMean: mean(all.map((p) => p.distance)),
    targetSpeedMean: mean(all.map((p) => p.targetSpeed)),
    pickupSpeedMean: mean(all.filter((p) => p.ok).map((p) => p.pickupSpeed)),
    pickupTurnMean: mean(all.filter((p) => p.ok).map((p) => p.pickupTurn)),
    noReceptionPct: (100 * results.filter((r) => r.stopped === 'no-reception').length) / results.length,
    badReceptionPct: (100 * results.filter((r) => r.stopped === 'bad-reception').length) / results.length,
  };
}

export function runMany(tuning: Tuning, level: string, policy: HumanPolicy, seeds = 100, count = 5): Summary {
  const out: ChainResult[] = [];
  for (let s = 1; s <= seeds; s++) out.push(runChain(s, tuning, level, policy, count));
  return summarize(out);
}

export function fmt(s: Summary): string {
  const f = (v: number, d = 2): string => (Number.isNaN(v) ? '  -' : v.toFixed(d));
  return `chains done ${s.completedPct.toFixed(0)}% (ball never reached him ${s.noReceptionPct.toFixed(0)}%, bad reception ${s.badReceptionPct.toFixed(0)}%) | 5-pass time mean ${f(s.totalMean)}s p50 ${f(s.totalP50)}s p90 ${f(s.totalP90)}s | per pass: ok ${s.passOkPct.toFixed(0)}% clean ${s.cleanPct.toFixed(0)}% flight ${f(s.flightMean)}s reaction→release ${f(s.reactionMean)}s ball waiting near receiver ${f(s.waitingMean)}s dist ${f(s.distanceMean, 1)}m receiver speed at release ${f(s.targetSpeedMean, 1)}m/s, at pickup ${f(s.pickupSpeedMean, 1)}m/s, heading off next target ${f(s.pickupTurnMean, 0)}°`;
}

export const BASE_TUNING = (): Tuning => structuredClone(TUNING);

/** The factory values of v0.1.20 for the numbers retuned in v0.1.21 (for before/after runs). */
export function asV0120(t: Tuning): Tuning {
  t.pass.lead = 1;
  t.mates.supportSpeed = 0.6;
  t.receive.firstTouchWindow = 0.2;
  t.receive.firstTouchError = 1.6;
  t.input.bufferTime = 0.15;
  t.dribble.pickupRadius = 0.45;
  return t;
}

export interface SingleStats {
  /** % in which the receiver ends with the ball (within 4 s). */
  has: number;
  /** % of clean receptions (of all). */
  clean: number;
}

/** One pass of the controlled player to a teammate at 5-35 m (the other teammate is out of the cone). */
export function runSingles(tuning: Tuning, level: string, height: number, lo: number, hi: number, aimError: number, n = 150): SingleStats {
  let has = 0;
  let clean = 0;
  for (let seed = 1; seed <= n; seed++) {
    const rnd = lcg(seed * 7 + 3);
    const t = tuning;
    const w = createWorld(seed, 2);
    w.assist = level as WorldState['assist'];
    const step = (c: PlayerCommand): void => stepWorld(w, [c], t);
    for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(cmd(0.5, 0));
    for (let i = 0; i < 60; i++) step(cmd());
    const p = w.players[0]!;
    const r = w.players[1]!;
    const dist = lo + rnd() * (hi - lo);
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
    const a = Math.atan2(r.y - p.y, r.x - p.x) + (rnd() * 2 - 1) * aimError;
    step(cmd(Math.cos(a), Math.sin(a), { pass: true, passHeight: height }));
    const t0 = w.tick;
    let outcome = -1;
    for (let i = 0; i < 240 && w.ball.owner !== 1; i++) {
      step(cmd());
      if (outcome < 0 && w.lastReceptionTick >= t0 && w.lastReceptionPlayer === 1) outcome = w.lastReceptionOutcome;
    }
    if (w.ball.owner === 1) has++;
    if (outcome === 0) clean++;
  }
  return { has: (100 * has) / n, clean: (100 * clean) / n };
}

export interface CutStats {
  /** Seconds until the velocity points to the new direction (within 20°) at ≥ 60 % of the old speed. */
  turned: number;
  /** Seconds until he is back to ≥ 90 % of the old speed in the new direction. */
  recovered: number;
  /** Metres skated until recovered. */
  distance: number;
  /** Did the lateral cut (trencada) trigger? */
  cut: boolean;
}

/** Skating at full speed along +x, the stick turns 90° to +y: instantly (a flick: trencada) or over `slowTurn` seconds. */
export function measureTurn(tuning: Tuning, slowTurn: number): CutStats {
  const t = tuning;
  const w = createWorld(1, 0);
  const step = (c: PlayerCommand): void => stepWorld(w, [c], t);
  const p = w.players[0]!;
  p.x = p.prevX = -15;
  p.y = p.prevY = -6;
  for (let i = 0; i < 150; i++) step(cmd(1, 0, { sprint: false }));
  const v0 = Math.hypot(p.vx, p.vy);
  const x0 = p.x;
  const y0 = p.y;
  let cut = false;
  let turned = Number.NaN;
  let recovered = Number.NaN;
  let dist = Number.NaN;
  for (let i = 1; i <= 240; i++) {
    const f = slowTurn > 0 ? Math.min(1, i / (slowTurn * 60)) : 1;
    const a = (f * Math.PI) / 2;
    step(cmd(Math.cos(a), Math.sin(a)));
    if (p.cutPrep > 0 || p.cutTime > 0) cut = true;
    const sp = Math.hypot(p.vx, p.vy);
    const ang = Math.abs(Math.atan2(p.vy, p.vx) - Math.PI / 2);
    if (Number.isNaN(turned) && ang < 0.35 && sp >= 0.6 * v0) turned = i / 60;
    if (Number.isNaN(recovered) && ang < 0.35 && sp >= 0.9 * v0) {
      recovered = i / 60;
      dist = Math.hypot(p.x - x0, p.y - y0);
    }
  }
  return { turned, recovered, distance: dist, cut };
}
