import { goalLineX, RINK } from '../../../src/config/rink';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { createBall, stepBall, type BallEvent, type BallState } from '../../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { createPlayer, type PlayerState } from '../../../src/sim/player';
import { boardSignedDistance, goalFootprints, resolveStatic } from '../../../src/sim/rink';
import { createRng } from '../../../src/sim/rng';
import { heightAt } from '../../../src/sim/shot';
import { createWorld, stepWorld, type WorldState } from '../../../src/sim/world';
import type { AssistLevel } from '../../../src/sim/pass';
import { bladePoint } from '../../../src/sim/dribble';
import { TUNING_PARAMS } from '../../../src/config/tuningMeta';
import { setAt } from '../../../src/game/tuningOverrides';

// Stress bench (BLOQUE 2, docs/audit/B.md §B): thousands of short free-play games with
// reproducible random inputs, checking the world after every tick (NaN / Infinity, ball or
// players out of the rink, tunnelling, ball stuck, pass / volley states that never resolve,
// determinism). Inputs come from a seeded LCG (never the global random); the world from
// createWorld(seed, teammates). Run with
//   PATINS_BENCH=1 npx vitest run tests/unit/bench/stressBench --maxWorkers=1
// Not part of the normal test run (see stressBench.test.ts).

const TICK = 1 / 60;
const R = RINK.ballRadius;
const HW = RINK.goalWidth / 2;
const H = RINK.goalHeight;
const D = RINK.goalDepthBottom;
const PR = RINK.goalPostDiameter / 2;
const TOP = H + PR;
const GOAL_BOXES = goalFootprints();

// --- Seeded inputs ---------------------------------------------------------------------------

/** 32-bit LCG (Numerical Recipes constants). Only the input generator uses it. */
export class Lcg {
  private s: number;
  constructor(seed: number) {
    this.s = (seed ^ 0x2545f491) >>> 0;
    this.next();
    this.next();
  }
  /** Uniform in [0, 1) (top bits of the state). */
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

type Mode = 'random' | 'flick' | 'chase' | 'release' | 'goal';
const MODES: readonly Mode[] = ['random', 'flick', 'chase', 'chase', 'release', 'goal', 'goal'];

/**
 * The random "human": a stick segment (random direction, trencada flicks, chase the ball, stick
 * released, towards the goal) plus PASE / TIRO presses (tap or held, the 3 heights, the height
 * changed while held), REGATE and CANVI taps, both buttons held at once, and volley attempts
 * (TIRO held while a ball in the air comes, released around the contact ± 0.3 s, sometimes held
 * through it: the late release). It looks at the world, so it is still a deterministic function of
 * (world, its own LCG). `rate` = calls per game second (60 when called every tick).
 */
export interface Policy {
  rng: Lcg;
  rate: number;
  seg: number;
  mode: Mode;
  angle: number;
  mag: number;
  sprint: boolean;
  flickIn: number;
  pass: number;
  passHeight: number;
  shoot: number;
  shootHeight: number;
}

export function createPolicy(seed: number, rate = 60): Policy {
  return { rng: new Lcg(seed), rate, seg: 0, mode: 'random', angle: 0, mag: 0, sprint: false, flickIn: 0, pass: -1, passHeight: 0, shoot: -1, shootHeight: 0 };
}

const HEIGHTS = [0, 0, 1, 1, 2] as const;

export function policyStep(world: WorldState, s: Policy, out: PlayerCommand): void {
  const r = s.rng;
  const k = s.rate / 60;
  const me = world.players[world.controlled]!;
  const ball = world.ball;
  const mine = ball.owner === world.controlled;
  out.pass = out.shoot = out.dribble = out.switchPlayer = false;
  // Stick.
  if (--s.seg <= 0) {
    s.mode = MODES[r.int(MODES.length)]!;
    s.seg = Math.max(1, Math.round((3 + r.int(58)) * k));
    s.angle = r.range(-Math.PI, Math.PI);
    s.mag = [0.15, 0.4, 0.7, 1, 1][r.int(5)]!;
    s.sprint = r.chance(0.45);
    s.flickIn = 0;
  }
  let angle = s.angle;
  let mag = s.mag;
  if (s.mode === 'flick') {
    if (--s.flickIn <= 0) {
      s.angle += (r.chance(0.5) ? 1 : -1) * r.range(0.9, 2.6);
      s.flickIn = Math.max(1, Math.round((2 + r.int(14)) * k));
    }
    angle = s.angle;
    mag = 1;
    s.sprint = true;
  } else if (s.mode === 'chase') {
    const tx = mine ? goalLineX(1) : ball.x;
    const ty = mine ? 0 : ball.y;
    angle = Math.atan2(ty - me.y, tx - me.x) + r.range(-0.15, 0.15);
    mag = 1;
  } else if (s.mode === 'release') mag = 0;
  else if (s.mode === 'goal') {
    angle = Math.atan2(r.range(-1.2, 1.2) - me.y, goalLineX(1) - me.x) + r.range(-0.2, 0.2);
    mag = s.mag < 0.3 ? 0 : 1;
  }
  out.moveX = Math.cos(angle) * mag;
  out.moveY = Math.sin(angle) * mag;
  out.sprint = s.sprint;
  // PASE: tap or held 1-90 ticks, 3 heights, the height may change while held (the slide).
  if (s.pass >= 0) {
    s.pass--;
    out.passHeld = s.pass >= 0;
    if (out.passHeld && r.chance(0.02)) s.passHeight = HEIGHTS[r.int(5)]!;
  } else if (r.chance(mine ? 0.035 : 0.006)) {
    out.pass = true;
    s.passHeight = HEIGHTS[r.int(5)]!;
    s.pass = r.chance(0.35) ? -1 : Math.max(0, Math.round(r.int(90) * k));
    out.passHeld = s.pass >= 0;
  } else out.passHeld = false;
  out.passHeight = s.passHeight;
  // TIRO: with the ball (more often near the goal), and volley attempts on a ball in the air.
  const nearGoal = mine && Math.hypot(goalLineX(1) - ball.x, ball.y) < 12;
  if (s.shoot >= 0) {
    s.shoot--;
    out.shootHeld = s.shoot >= 0;
    if (out.shootHeld && r.chance(0.02)) s.shootHeight = HEIGHTS[r.int(5)]!;
  } else if (ball.owner < 0 && world.volley.found && r.chance(0.3)) {
    out.shoot = true;
    s.shootHeight = HEIGHTS[r.int(5)]!;
    s.shoot = Math.max(-1, Math.round((world.volley.time + r.range(-0.3, 0.35)) * s.rate));
    out.shootHeld = s.shoot >= 0;
  } else if (r.chance(nearGoal ? 0.05 : mine ? 0.01 : 0.004)) {
    out.shoot = true;
    s.shootHeight = HEIGHTS[r.int(5)]!;
    s.shoot = r.chance(0.4) ? -1 : Math.max(0, Math.round(r.int(120) * k));
    out.shootHeld = s.shoot >= 0;
  } else out.shootHeld = false;
  out.shootHeight = s.shootHeight;
  out.dribble = r.chance(0.008);
  // CANVI: now and then, and mashed while the stick carries a volley (late release).
  out.switchPlayer = r.chance(world.volley.hold > 0 ? 0.08 : 0.006);
}

// --- Report ----------------------------------------------------------------------------------

export interface Issue {
  kind: string;
  seed: number;
  tick: number;
  detail: string;
}

/** Counts of every check that failed, a few examples of each, maxima and coverage counters. */
export class Report {
  readonly counts = new Map<string, number>();
  readonly examples = new Map<string, Issue[]>();
  readonly max = new Map<string, number>();
  readonly cover = new Map<string, number>();
  games = 0;
  ticks = 0;

  add(kind: string, seed: number, tick: number, detail: string): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1);
    const ex = this.examples.get(kind) ?? [];
    if (ex.length < 4) ex.push({ kind, seed, tick, detail });
    this.examples.set(kind, ex);
  }
  /** Where each maximum happened (seed, tick). */
  readonly maxAt = new Map<string, string>();
  peak(name: string, v: number, seed = -1, tick = -1): void {
    if (!(v <= (this.max.get(name) ?? Number.NEGATIVE_INFINITY))) {
      this.max.set(name, v);
      if (seed >= 0) this.maxAt.set(name, `s${seed}t${tick}`);
    }
  }
  count(name: string, n = 1): void {
    this.cover.set(name, (this.cover.get(name) ?? 0) + n);
  }
  format(title: string): string {
    const lines = [`== ${title}: ${this.games} games, ${this.ticks} ticks (${(this.ticks / 60).toFixed(0)} s of game time)`];
    lines.push(`  coverage: ${[...this.cover].map(([k, v]) => `${k} ${v}`).join(', ')}`);
    lines.push(`  maxima: ${[...this.max].map(([k, v]) => `${k} ${v.toFixed(3)}${this.maxAt.has(k) ? ` (${this.maxAt.get(k)})` : ''}`).join(', ')}`);
    if (this.counts.size === 0) lines.push('  issues: none');
    for (const [k, n] of [...this.counts].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ISSUE ${k}: ${n}`);
      for (const e of this.examples.get(k) ?? []) lines.push(`     seed ${e.seed} tick ${e.tick}: ${e.detail}`);
    }
    return lines.join('\n');
  }
}

// --- Geometry checks -------------------------------------------------------------------------

const nrm = { nx: 0, ny: 0 };

/** Depth of the ball inside a capsule a→b of radius rad (m, > 0 = overlapping). */
function capsulePen(b: BallState, ax: number, ay: number, az: number, bx: number, by: number, bz: number, rad: number): number {
  const sx = bx - ax;
  const sy = by - ay;
  const sz = bz - az;
  const len2 = sx * sx + sy * sy + sz * sz;
  let t = len2 > 0 ? ((b.x - ax) * sx + (b.y - ay) * sy + (b.z - az) * sz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return R + rad - Math.hypot(b.x - (ax + sx * t), b.y - (ay + sy * t), b.z - (az + sz * t));
}

/** Deepest overlap of the ball with any post or crossbar (m). */
export function framePen(b: BallState): number {
  let pen = Number.NEGATIVE_INFINITY;
  for (const side of [-1, 1] as const) {
    const fx = goalLineX(side) + side * PR;
    pen = Math.max(
      pen,
      capsulePen(b, fx, -HW - PR, 0, fx, -HW - PR, TOP, PR),
      capsulePen(b, fx, HW + PR, 0, fx, HW + PR, TOP, PR),
      capsulePen(b, fx, -HW - PR, TOP, fx, HW + PR, TOP, PR),
    );
  }
  return pen;
}

/** The ball's centre is inside the cage (behind the goal line by more than its radius, in front of the back net, under the bar, between the posts). */
export function inCage(b: BallState, side: -1 | 1): boolean {
  const u = side * (b.x - goalLineX(side));
  return u > R + 1e-3 && u < D - 1e-3 && Math.abs(b.y) < HW && b.z < H;
}

/** Overlap of the ball with the solid outside of a cage (box covered by net), the mouth excluded, as src/sim/ball.ts sees it. */
export function cageBoxPen(b: BallState, side: -1 | 1): number {
  const gx = goalLineX(side);
  const u = side * (b.x - gx);
  if (u <= -R) return Number.NEGATIVE_INFINITY;
  if (u <= R && Math.abs(b.y) < HW && b.z < H) return Number.NEGATIVE_INFINITY; // the mouth
  const minX = Math.min(gx, gx + side * (D + PR));
  const maxX = Math.max(gx, gx + side * (D + PR));
  const cx = Math.min(Math.max(b.x, minX), maxX);
  const cy = Math.min(Math.max(b.y, -HW - PR), HW + PR);
  const cz = Math.min(Math.max(b.z, 0), TOP);
  const d = Math.hypot(b.x - cx, b.y - cy, b.z - cz);
  if (d > 1e-9) return R - d;
  return R + Math.min(HW + PR - Math.abs(b.y), D + PR - u, TOP - b.z);
}

export interface BallCheck {
  /** Ball centre beyond the board line (m, > 0 = outside) and its surface into the boards. */
  beyond: number;
  boardPen: number;
  frame: number;
  box: number;
  ghost: boolean;
  inGoalBad: boolean;
  below: boolean;
}

const bc: BallCheck = { beyond: 0, boardPen: 0, frame: 0, box: 0, ghost: false, inGoalBad: false, below: false };

/** Geometry of the ball now (shared by the stress games and the tunnelling sweep). */
export function ballGeometry(b: BallState): BallCheck {
  const sd = boardSignedDistance(b.x, b.y, nrm);
  bc.beyond = sd;
  bc.boardPen = b.z < RINK.boardHeight ? sd + R : Number.NEGATIVE_INFINITY;
  bc.below = b.z < R - 1e-6;
  if (b.inGoal !== 0) {
    const u = b.inGoal * (b.x - goalLineX(b.inGoal));
    const e = 1e-6;
    // Clamped inside the cage from the substep after it went in (b.scored); until then it is on the goal line.
    bc.inGoalBad = b.scored
      ? u < R - e || u > D - R + e || Math.abs(b.y) > HW - R + e || b.z < R - e || b.z > H - R + e
      : u < -e || u > D || Math.abs(b.y) > HW || b.z > H;
    bc.frame = bc.box = Number.NEGATIVE_INFINITY;
    bc.ghost = false;
  } else {
    bc.inGoalBad = false;
    bc.frame = framePen(b);
    bc.ghost = inCage(b, -1) || inCage(b, 1);
    bc.box = bc.ghost ? Number.NEGATIVE_INFINITY : Math.max(cageBoxPen(b, -1), cageBoxPen(b, 1));
  }
  return bc;
}

// --- Finite values ---------------------------------------------------------------------------

/** Fields that hold NaN on purpose ("none"); they must still never be ±Infinity. */
const NAN_OK = new Set(['latchDir', 'meetX', 'meetY', 'wallX', 'wallY', 'timing', 'contactHeight', 'shotPressHeading', 'receivedBallAngle', 'stickHist']);

function finiteOk(v: unknown, key: string): boolean {
  if (typeof v === 'number') return Number.isFinite(v) || (Number.isNaN(v) && NAN_OK.has(key));
  if (Array.isArray(v)) {
    for (const x of v) if (!finiteOk(x, key)) return false;
    return true;
  }
  if (v && typeof v === 'object') {
    for (const k in v) if (!finiteOk((v as Record<string, unknown>)[k], k)) return false;
  }
  return true;
}

/** Paths of the bad numbers (only called once a check failed). */
export function badNumbers(v: unknown, key = 'world', path = 'world', out: string[] = []): string[] {
  if (typeof v === 'number') {
    if (!(Number.isFinite(v) || (Number.isNaN(v) && NAN_OK.has(key)))) out.push(`${path}=${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => badNumbers(x, key, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const k in v) badNumbers((v as Record<string, unknown>)[k], k, `${path}.${k}`, out);
  return out;
}

// --- World hash ------------------------------------------------------------------------------

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

function mix(h: number, x: number): number {
  return Math.imul(h ^ x, 0x01000193) >>> 0;
}

/** FNV-style hash of every value of the world (numbers by their exact float bits, NaN canonical). */
export function worldHash(v: unknown, h = 0x811c9dc5): number {
  if (typeof v === 'number') {
    f64[0] = Number.isNaN(v) ? Number.NaN : v === 0 ? 0 : v;
    return mix(mix(h, u32[0]!), u32[1]!);
  }
  if (typeof v === 'boolean') return mix(h, v ? 3 : 5);
  if (typeof v === 'string') {
    for (let i = 0; i < v.length; i++) h = mix(h, v.charCodeAt(i));
    return h;
  }
  if (Array.isArray(v)) {
    h = mix(h, v.length);
    for (const x of v) h = worldHash(x, h);
    return h;
  }
  if (v && typeof v === 'object') {
    for (const k in v) h = worldHash((v as Record<string, unknown>)[k], worldHash(k, h));
    return h;
  }
  return mix(h, 7);
}

/** Paths whose values differ between two worlds (NaN equals NaN). */
export function diffPaths(a: unknown, b: unknown, path = 'world', out: string[] = []): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) out.push(`${path}: ${a} vs ${b}`);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} vs ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diffPaths(a[i], b[i], `${path}[${i}]`, out);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k in a) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  } else if (a !== b) out.push(`${path}: ${String(a)} vs ${String(b)}`);
  return out;
}

/** The state that drives behaviour (positions, velocities, possession, timers, rng): no HUD-only fields. */
export function coreState(w: WorldState): unknown {
  return {
    tick: w.tick,
    rng: w.rng,
    ball: w.ball,
    players: w.players,
    controlled: w.controlled,
    passTo: w.passTo,
    passFrom: w.passFrom,
    wallFrom: w.wallFrom,
    wallBack: w.wallBack,
    ballResetTicks: w.ballResetTicks,
    volley: { found: w.volley.found, incoming: w.volley.incoming, contactTick: w.volley.contactTick, hold: w.volley.hold, open: w.volley.open },
  };
}

// --- Reachability probe ----------------------------------------------------------------------

/** Does the segment (ax, ay)→(bx, by) pass within `m` of a goal cage's footprint? Returns that cage or null. */
function cageOnPath(ax: number, ay: number, bx: number, by: number, m: number): (typeof GOAL_BOXES)[number] | null {
  for (const box of GOAL_BOXES) {
    for (let s = 0; s <= 40; s++) {
      const x = ax + ((bx - ax) * s) / 40;
      const y = ay + ((by - ay) * s) / 40;
      if (x > box.minX - m && x < box.maxX + m && y > box.minY - m && y < box.maxY + m) return box;
    }
  }
  return null;
}

/**
 * From a copy of the world, drive the controlled player at the loose ball (round a goal cage in
 * the way, sprinting when far, slowing when near) for up to `maxTicks`: ticks until somebody
 * takes it, or −1.
 */
export function probeReach(world: WorldState, tuning: Tuning, maxTicks = 600): number {
  const w = structuredClone(world);
  const cmd = emptyCommand();
  for (let t = 0; t < maxTicks; t++) {
    if (w.ball.owner >= 0) return t;
    const p = w.players[w.controlled]!;
    let tx = w.ball.x;
    let ty = w.ball.y;
    const box = cageOnPath(p.x, p.y, tx, ty, tuning.skating.radius + 0.05);
    if (box && Math.hypot(tx - p.x, ty - p.y) > 1) {
      // Round the cage by the side the ball (or he) is on, level with its middle.
      const side = (Math.abs(ty) > 0.2 ? ty : p.y) >= 0 ? 1 : -1;
      const wx = (box.minX + box.maxX) / 2;
      const wy = side * (box.maxY + 0.7);
      if (Math.hypot(wx - p.x, wy - p.y) > 0.4) {
        tx = wx;
        ty = wy;
      }
    }
    steer(p, tx, ty, cmd);
    stepWorld(w, [cmd], tuning);
  }
  return -1;
}

/** Stick towards (tx, ty): slow down near it, and pivot first (slow) when it is well off the heading. */
function steer(p: PlayerState, tx: number, ty: number, cmd: PlayerCommand): void {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.max(1e-6, Math.hypot(dx, dy));
  let off = Math.atan2(dy, dx) - p.heading;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  const m = Math.abs(off) > 0.8 ? 0.2 : Math.max(0.2, Math.min(1, d / 2.5));
  cmd.moveX = (dx / d) * m;
  cmd.moveY = (dy / d) * m;
  cmd.sprint = d > 4 && Math.abs(off) < 0.5;
}

/**
 * Can the ball be taken where it lies at all? From 16 directions at 0.9 and 1.6 m (where a
 * skater fits: inside the boards, off the cages), the controlled player is put there facing it,
 * still, and skates at it for 2 s. Returns how many of those approaches took it, and how many
 * could be tried.
 */
export function ringReach(world: WorldState, tuning: Tuning): { ok: number; tried: number } {
  let ok = 0;
  let tried = 0;
  const rad = tuning.skating.radius;
  const cmd = emptyCommand();
  for (const dist of [0.9, 1.6]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = world.ball.x + Math.cos(a) * dist;
      const y = world.ball.y + Math.sin(a) * dist;
      if (boardSignedDistance(x, y, nrm) + rad > -0.01) continue;
      if (GOAL_BOXES.some((b) => x > b.minX - rad - 0.01 && x < b.maxX + rad + 0.01 && y > b.minY - rad - 0.01 && y < b.maxY + rad + 0.01)) continue;
      tried++;
      const w = structuredClone(world);
      const p = w.players[w.controlled]!;
      p.x = p.prevX = x;
      p.y = p.prevY = y;
      p.vx = p.vy = 0;
      p.heading = p.prevHeading = a + Math.PI;
      p.noPickupTicks = 0;
      for (let t = 0; t < 120 && w.ball.owner < 0; t++) {
        steer(w.players[w.controlled]!, w.ball.x, w.ball.y, cmd);
        stepWorld(w, [cmd], tuning);
      }
      if (w.ball.owner >= 0) ok++;
    }
  }
  return { ok, tried };
}

// --- Per-game monitor ------------------------------------------------------------------------

const S = (s: number): number => Math.round(s * 60);
const fmt = (x: number, n = 3): string => x.toFixed(n);

/**
 * Checks the world after every tick of one game and keeps the per-game timers of the "stuck"
 * checks. Coverage counters say what the random inputs actually exercised.
 */
export class Monitor {
  private px = Number.NaN;
  private py = Number.NaN;
  private pz = Number.NaN;
  private pvx = 0;
  private pvy = 0;
  private pInGoal = 0;
  private pOwner = -1;
  private pControlled = 0;
  private pHold = 0;
  private pResetTicks = 0;
  private pScored = false;
  private pShotTick = -1000;
  private pPassTick = -1000;
  private pReceptionTick = -1000;
  private pHighTick = -1000;
  private pTurnTick = -1000;
  private pWallFrom = -1;
  private pRespawn = false;
  private respawn = false;
  private readonly pCut: boolean[] = [];
  private readonly pSkid: boolean[] = [];
  private still = 0;
  private high = 0;
  private passTo = 0;
  private passFrom = 0;
  private wallFrom = 0;
  private holdTicks = 0;
  private notScored = 0;
  private resetTicks = 0;
  private stuckReported = new Set<string>();
  private readonly path: number[] = [];
  private readonly posX: number[] = [];
  private readonly posY: number[] = [];

  constructor(
    private readonly report: Report,
    private readonly seed: number,
    private readonly tuning: Tuning,
    private readonly probes = true,
  ) {}

  private once(kind: string, tick: number, detail: string): void {
    if (this.stuckReported.has(kind)) return;
    this.stuckReported.add(kind);
    this.report.add(kind, this.seed, tick, detail);
  }

  after(w: WorldState): void {
    const rep = this.report;
    const t = w.tick;
    const b = w.ball;
    const n = w.players.length;
    rep.ticks++;
    // NaN / Infinity anywhere (sentinel NaN fields allowed, never ±Infinity).
    if (!finiteOk(w, 'world')) rep.add('nonFinite', this.seed, t, badNumbers(w).slice(0, 4).join('; '));
    // Indices.
    const okIdx = (i: number, min: number): boolean => Number.isInteger(i) && i >= min && i < n;
    if (!okIdx(w.controlled, 0) || !okIdx(b.owner, -1) || !okIdx(w.passTo, -1) || !okIdx(w.passFrom, -1) || !okIdx(w.wallFrom, -1) || !okIdx(w.wallBack, -1) || !okIdx(w.aimTarget, -1)) {
      rep.add('badIndex', this.seed, t, `controlled ${w.controlled} owner ${b.owner} passTo ${w.passTo} passFrom ${w.passFrom} wall ${w.wallFrom}/${w.wallBack} aim ${w.aimTarget}`);
    }
    if (b.out) rep.add('outFlagLeft', this.seed, t, `ball ${fmt(b.x)},${fmt(b.y)},${fmt(b.z)}`);

    // Ball geometry.
    const carried = b.owner >= 0;
    const hold = w.volley.hold > 0;
    const state = hold ? 'hold' : carried ? 'carried' : 'loose';
    const g = ballGeometry(b);
    if (g.below) rep.add('ballBelowFloor', this.seed, t, `z ${b.z}`);
    rep.peak(`boardPen.${state}`, g.boardPen, this.seed, t);
    rep.peak(`beyondBoardLine.${state}`, g.beyond, this.seed, t);
    if (g.beyond > 1e-3 && !(b.z >= RINK.boardHeight + R * 0.5)) {
      rep.add(`ballBeyondBoards.${state}`, this.seed, t, `centre ${fmt(g.beyond)} m beyond the board line at ${fmt(b.x, 2)},${fmt(b.y, 2)} z ${fmt(b.z, 2)} owner ${b.owner} controlled ${w.controlled} holdHeight ${fmt(w.volley.holdHeight, 2)}`);
    } else if (g.boardPen > 0.01) {
      rep.add(`ballIntoBoards.${state}`, this.seed, t, `surface ${fmt(g.boardPen)} m into the boards at ${fmt(b.x, 2)},${fmt(b.y, 2)} z ${fmt(b.z, 2)}`);
    }
    if (g.beyond > 0 && b.z >= RINK.boardHeight + R * 0.5) rep.add(`ballAboveOutsideNotOut.${state}`, this.seed, t, `at ${fmt(b.x, 2)},${fmt(b.y, 2)} z ${fmt(b.z, 2)}`);
    rep.peak(`framePen.${state}`, g.frame, this.seed, t);
    if (g.frame > 2e-3) rep.add(`ballInPost.${state}`, this.seed, t, `${fmt(g.frame)} m into a post/bar at ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)}`);
    rep.peak(`cageBoxPen.${state}`, g.box, this.seed, t);
    if (g.box > 2e-3) rep.add(`ballInCageNet.${state}`, this.seed, t, `${fmt(g.box)} m into the outside of a cage at ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)} inGoal ${b.inGoal}`);
    if (g.ghost) rep.add(`ballInCageNotGoal.${state}`, this.seed, t, `at ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)} inGoal 0 owner ${b.owner} controlled ${w.controlled} hold ${w.volley.hold}`);
    if (g.inGoalBad) rep.add('inGoalOutOfCage', this.seed, t, `at ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)} inGoal ${b.inGoal}`);
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    rep.peak(`ballSpeed.${state}`, sp, this.seed, t);
    if (sp > 45) rep.add('ballSpeedHigh', this.seed, t, `${fmt(sp, 1)} m/s ${state}`);

    // Goals: through the mouth only.
    const outEvent = w.events.some((e) => e.type === 'out');
    if (b.inGoal !== 0 && this.pInGoal === 0) {
      rep.count('goals');
      const side = b.inGoal;
      const gx = goalLineX(side);
      const u0 = side * (this.px - gx);
      const u1 = side * (b.x - gx);
      // Where the straight path between the two ticks crosses the goal line (the previous tick in front of it).
      const f = u0 <= 0 && u1 > u0 ? -u0 / (u1 - u0) : u0 <= R ? 0 : Number.NaN;
      const cy = this.py + (b.y - this.py) * f;
      const cz = this.pz + (b.z - this.pz) * f;
      if (!(Math.abs(cy) < HW + 0.05 && cz < H + 0.05)) rep.add('goalNotThroughMouth', this.seed, t, `prev ${fmt(this.px, 2)},${fmt(this.py, 2)},${fmt(this.pz, 2)} now ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)} owner was ${this.pOwner}`);
    }
    if (b.inGoal !== 0 && !b.scored) {
      if (++this.notScored > 1) rep.add('inGoalNotScored', this.seed, t, `${this.notScored} ticks`);
    } else this.notScored = 0;
    if (b.scored && !this.pScored) rep.count('scored');
    this.respawn = false;
    if (outEvent) {
      rep.count('outs');
      // The ball is put back in front of the controlled player: never inside a goal cage.
      for (const box of GOAL_BOXES) {
        if (b.x > box.minX - R && b.x < box.maxX + R && b.y > box.minY - R && b.y < box.maxY + R) {
          this.respawn = true;
          rep.add('outRespawnInGoal', this.seed, t, `put back at ${fmt(b.x, 2)},${fmt(b.y, 2)} (controlled at ${fmt(w.players[w.controlled]!.x, 2)},${fmt(w.players[w.controlled]!.y, 2)} heading ${fmt(w.players[w.controlled]!.heading, 2)})`);
        }
      }
    }

    // Teleports: horizontal displacement in a tick against the speeds before and after it. The
    // snaps that are by design are measured apart: the stick catching a volley for the late
    // release (≤ volley.reach, first tick of the hold) and a ball in the air taken down to the
    // stick (vertical).
    const reset = outEvent || (this.pResetTicks > 0 && w.ballResetTicks === 0);
    if (!Number.isNaN(this.px) && !reset) {
      const jump = Math.hypot(b.x - this.px, b.y - this.py);
      const v = Math.max(Math.hypot(this.pvx, this.pvy), Math.hypot(b.vx, b.vy));
      const owner = carried ? w.players[b.owner]! : null;
      const me = w.players[w.controlled]!;
      let kind: string;
      let allowed: number;
      if (this.pHold > 0) {
        const catchTick = this.pHold === S(this.tuning.volley.windowTime / 2) && this.pControlled === w.controlled;
        kind = catchTick ? 'holdCatch' : this.pControlled !== w.controlled ? 'holdAfterSwitch' : 'hold';
        allowed = (catchTick ? this.tuning.volley.reach : 0.35) + v * TICK * 1.2 + Math.hypot(me.vx, me.vy) * TICK;
      } else if (this.pOwner >= 0 && carried) {
        kind = 'carried';
        allowed = 0.5 + (owner ? Math.hypot(owner.vx, owner.vy) * TICK : 0);
      } else if (this.pOwner >= 0) {
        kind = 'released';
        allowed = 0.4 + v * TICK * 1.2;
      } else {
        kind = carried ? 'pickup' : this.pRespawn ? 'afterRespawnInGoal' : 'loose';
        allowed = v * TICK * 1.2 + 0.08;
      }
      rep.peak(`jump.${kind}`, jump, this.seed, t);
      if (jump > allowed) rep.add(`ballTeleport.${kind}`, this.seed, t, `${fmt(jump, 2)} m in one tick (allowed ${fmt(allowed, 2)}) from ${fmt(this.px, 2)},${fmt(this.py, 2)},${fmt(this.pz, 2)} to ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)}; controlled ${this.pControlled}→${w.controlled} owner ${this.pOwner}→${b.owner} hold ${this.pHold}→${w.volley.hold}`);
      const drop = this.pz - b.z;
      rep.peak('zDropInOneTick', drop, this.seed, t);
      if (drop > 0.25 && w.lastReceptionTick === t - 1) rep.count('highBallTakenDown');
    }

    // Players.
    for (let i = 0; i < n; i++) {
      const p = w.players[i]!;
      const rad = this.tuning.skating.radius;
      const pen = boardSignedDistance(p.x, p.y, nrm) + rad;
      rep.peak('playerBoardPen', pen, this.seed, t);
      if (pen > 5e-3) rep.add('playerIntoBoards', this.seed, t, `player ${i} ${fmt(pen)} m into the boards at ${fmt(p.x, 2)},${fmt(p.y, 2)}`);
      for (const box of GOAL_BOXES) {
        const cx = Math.min(Math.max(p.x, box.minX), box.maxX);
        const cy = Math.min(Math.max(p.y, box.minY), box.maxY);
        const gp = rad - Math.hypot(p.x - cx, p.y - cy);
        rep.peak('playerGoalPen', gp, this.seed, t);
        if (gp > 5e-3) rep.add('playerIntoGoal', this.seed, t, `player ${i} ${fmt(gp)} m into a goal cage at ${fmt(p.x, 2)},${fmt(p.y, 2)}`);
      }
      const ps = Math.hypot(p.vx, p.vy);
      rep.peak('playerSpeed', ps, this.seed, t);
      if (ps > 16.01) rep.add('playerSpeedHigh', this.seed, t, `player ${i} ${fmt(ps, 1)} m/s`);
      for (let j = i + 1; j < n; j++) {
        const q = w.players[j]!;
        rep.peak('playerOverlap', 2 * rad - Math.hypot(p.x - q.x, p.y - q.y), this.seed, t);
      }
      if (p.shotTurn > 1) rep.add('shotTurnStuck', this.seed, t, `player ${i} shotTurn ${p.shotTurn}`);
    }

    // Stuck states.
    const loose = b.owner < 0 && b.inGoal === 0 && w.ballResetTicks === 0 && !hold;
    const hs = Math.hypot(b.vx, b.vy);
    // Loose ball at rest on the floor: after 4 s, can the controlled player get to it?
    if (loose && hs < 0.05 && b.z < R + 0.01) {
      if (++this.still === S(4)) {
        rep.count('stillEpisodes');
        if (this.probes) {
          rep.count('probes');
          const ticks = probeReach(w, this.tuning);
          if (ticks < 0) {
            // The simple driver failed from where he is: can the ball be taken from anywhere around it?
            const ring = ringReach(w, this.tuning);
            const where = `ball at rest at ${fmt(b.x, 2)},${fmt(b.y, 2)}; driver from ${fmt(w.players[w.controlled]!.x, 2)},${fmt(w.players[w.controlled]!.y, 2)} failed; approaches from around it ${ring.ok}/${ring.tried}`;
            rep.add(ring.ok === 0 ? 'ballUnreachable' : 'probeDriverFailed(info)', this.seed, t, where);
          } else rep.peak('probeTicks', ticks, this.seed, t);
        }
      }
    } else this.still = 0;
    // Ball resting above stick height (e.g. on a cage roof).
    if (loose && b.z > R + this.tuning.dribble.pickupMaxHeight && sp < 0.5) {
      if (++this.high === S(2)) rep.add('ballStuckHigh', this.seed, t, `ball at ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)} slow above stick height for 2 s`);
    } else this.high = 0;
    // Wedged: travels a lot in 2 s but stays in the same spot (vibrating between two obstacles).
    if (loose) {
      this.path.push(reset || Number.isNaN(this.px) ? 0 : Math.hypot(b.x - this.px, b.y - this.py));
      this.posX.push(b.x);
      this.posY.push(b.y);
      if (this.path.length > S(2)) {
        this.path.shift();
        this.posX.shift();
        this.posY.shift();
        let len = 0;
        for (const d of this.path) len += d;
        let far = 0;
        for (let i = 0; i < this.posX.length; i++) far = Math.max(far, Math.hypot(this.posX[i]! - this.posX[0]!, this.posY[i]! - this.posY[0]!));
        if (len > 3 && far < 0.3) this.once('ballWedged', t, `${fmt(len, 1)} m travelled in 2 s within ${fmt(far, 2)} m of ${fmt(b.x, 2)},${fmt(b.y, 2)}`);
      }
    } else {
      this.path.length = this.posX.length = this.posY.length = 0;
    }
    this.passTo = w.passTo >= 0 ? this.passTo + 1 : 0;
    if (this.passTo === S(8)) rep.add('passToStuck', this.seed, t, `passTo ${w.passTo} for 8 s, ball ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)} v ${fmt(sp, 2)} owner ${b.owner}`);
    this.passFrom = w.passFrom >= 0 && w.passTo < 0 ? this.passFrom + 1 : 0;
    if (this.passFrom === S(8)) rep.add('passFromLong(info)', this.seed, t, `passFrom ${w.passFrom} without receiver for 8 s (ball still rolling at ≥ 1 m/s or flying)`);
    this.wallFrom = w.wallFrom >= 0 ? this.wallFrom + 1 : 0;
    if (this.wallFrom === S(8)) rep.add('wallPassStuck', this.seed, t, `wallFrom ${w.wallFrom} for 8 s`);
    this.holdTicks = hold ? this.holdTicks + 1 : 0;
    if (this.holdTicks === S(this.tuning.volley.windowTime / 2) + 3) rep.add('volleyHoldStuck', this.seed, t, `hold ${w.volley.hold}`);
    if (w.volley.contactTick >= 0 && t - w.volley.contactTick === S(3)) rep.add('volleyContactStuck', this.seed, t, `contact open for 3 s, ball ${fmt(b.x, 2)},${fmt(b.y, 2)},${fmt(b.z, 2)} v ${fmt(sp, 2)}`);
    this.resetTicks = w.ballResetTicks > 0 ? this.resetTicks + 1 : 0;
    if (this.resetTicks === S(2)) rep.add('goalResetStuck', this.seed, t, `ballResetTicks ${w.ballResetTicks}`);

    // Coverage.
    if (w.lastShotTick === t - 1 && this.pShotTick !== w.lastShotTick) rep.count(w.lastShot.aerial ? 'volleys' : 'shots');
    if (w.lastPassTick === t - 1 && this.pPassTick !== w.lastPassTick) rep.count(`passes.k${w.lastPassKind}`);
    if (w.lastReceptionTick === t - 1 && this.pReceptionTick !== w.lastReceptionTick) rep.count(`receptions.o${w.lastReceptionOutcome}`);
    if (w.lastHighTick === t - 1 && this.pHighTick !== w.lastHighTick) rep.count('airReceptions');
    if (w.lastTurnTick === t - 1 && this.pTurnTick !== w.lastTurnTick) rep.count('turnShots');
    if (w.wallFrom >= 0 && this.pWallFrom < 0) rep.count('wallPasses');
    if (hold && this.pHold <= 0) rep.count('volleyHolds');
    if (w.controlled !== this.pControlled) rep.count('switches');
    for (let i = 0; i < n; i++) {
      const p = w.players[i]!;
      const cut = p.cutPrep > 0 || p.cutTime > 0;
      if (cut && !this.pCut[i]) rep.count('trencadas');
      if (p.skidTime > 0 && !this.pSkid[i]) rep.count('skids');
      this.pCut[i] = cut;
      this.pSkid[i] = p.skidTime > 0;
    }

    this.px = b.x;
    this.py = b.y;
    this.pz = b.z;
    this.pvx = b.vx;
    this.pvy = b.vy;
    this.pInGoal = b.inGoal;
    this.pOwner = b.owner;
    this.pControlled = w.controlled;
    this.pHold = w.volley.hold;
    this.pResetTicks = w.ballResetTicks;
    this.pScored = b.scored;
    this.pShotTick = w.lastShotTick;
    this.pPassTick = w.lastPassTick;
    this.pReceptionTick = w.lastReceptionTick;
    this.pHighTick = w.lastHighTick;
    this.pTurnTick = w.lastTurnTick;
    this.pWallFrom = w.wallFrom;
    this.pRespawn = this.respawn;
  }
}

// --- Games -----------------------------------------------------------------------------------

export const ASSISTS: readonly AssistLevel[] = ['medium', 'strong', 'light', 'off'];

export interface GameSetup {
  seed: number;
  mates: number;
  assist: AssistLevel;
  tuning: Tuning;
  variant: string;
}

/** The setup of stress game `seed`: mostly the game's own (2 teammates, default tuning), with the 4 assist levels, and a few variants. */
export function setupFor(seed: number): GameSetup {
  const tuning = structuredClone(TUNING);
  let variant = 'default';
  const v = seed % 20;
  if (v === 7) {
    tuning.ball.heavy = 1;
    variant = 'heavyBall';
  } else if (v === 13) {
    tuning.mates.switchControl = 0;
    variant = 'noSwitch';
  }
  const mates = v === 19 ? 0 : 2;
  if (mates === 0) variant = 'noMates';
  return { seed, mates, assist: ASSISTS[seed % 4]!, tuning, variant };
}

/** One stress game at the tick level: `seconds` of game time, the policy called every tick. Returns the world. */
export function stressGame(setup: GameSetup, seconds: number, report: Report, probes = true, record?: PlayerCommand[]): WorldState {
  const w = createWorld(setup.seed, setup.mates);
  w.assist = setup.assist;
  const pol = createPolicy(setup.seed * 7919 + 17);
  const mon = new Monitor(report, setup.seed, setup.tuning, probes);
  const cmd = emptyCommand();
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) {
    policyStep(w, pol, cmd);
    if (record) record.push({ ...cmd });
    stepWorld(w, [cmd], setup.tuning);
    mon.after(w);
  }
  report.games++;
  return w;
}

/** Replay recorded per-tick commands (no policy): the world after them. */
export function replay(setup: GameSetup, cmds: readonly PlayerCommand[], report?: Report): WorldState {
  const w = createWorld(setup.seed, setup.mates);
  w.assist = setup.assist;
  const mon = report ? new Monitor(report, setup.seed, setup.tuning, false) : null;
  for (const c of cmds) {
    stepWorld(w, [c], setup.tuning);
    mon?.after(w);
  }
  if (report) report.games++;
  return w;
}

// --- Tunnelling sweep (ball physics only, 28-37 m/s) ------------------------------------------

/** Launch from (x, y) towards (tx, ty) crossing it at height tz (lowest elevation, with drag), at `speed`. */
function aimLaunch(b: BallState, x: number, y: number, z: number, tx: number, ty: number, tz: number, speed: number, tuning: Tuning): void {
  const d = Math.hypot(tx - x, ty - y);
  const dir = Math.atan2(ty - y, tx - x);
  let e = 0;
  if (Math.abs(tz - z) > 0.005) {
    let lo = -0.8;
    let hi = 0.9;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const h = heightAt(speed, mid, d, tuning.ball, z);
      if (h < tz) lo = mid;
      else hi = mid;
    }
    e = hi;
  }
  b.x = b.prevX = x;
  b.y = b.prevY = y;
  b.z = b.prevZ = z;
  b.vx = Math.cos(dir) * Math.cos(e) * speed;
  b.vy = Math.sin(dir) * Math.cos(e) * speed;
  b.vz = Math.sin(e) * speed;
  b.owner = -1;
  b.inGoal = 0;
  b.scored = false;
  b.out = false;
}

export interface SweepCase {
  group: string;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  speed: number;
  /** What the shot must hit first ('' = anything). */
  expect: '' | 'post' | 'board' | 'goal' | 'net';
  players?: { x: number; y: number; vx: number; vy: number }[];
}

/** Fire one ball and check the geometry after every tick until it stops, goes out or is scored (≤ 2 s). */
export function fire(c: SweepCase, tuning: Tuning, seed: number, report: Report): void {
  const b = createBall(0, 0);
  aimLaunch(b, c.x, c.y, c.z, c.tx, c.ty, c.tz, c.speed, tuning);
  const players: PlayerState[] = (c.players ?? []).map((q, i) => {
    const p = createPlayer(i, q.x, q.y);
    p.vx = q.vx;
    p.vy = q.vy;
    return p;
  });
  const rng = createRng(seed);
  const events: BallEvent[] = [];
  let first = '';
  let px = b.x;
  let py = b.y;
  let pz = b.z;
  let pIn = 0;
  for (let tick = 0; tick < 120; tick++) {
    events.length = 0;
    for (const p of players) {
      p.x += p.vx * TICK;
      p.y += p.vy * TICK;
      resolveStatic(p, tuning.skating.radius, tuning.skating.wallRestitution, tuning.skating.wallFriction);
    }
    stepBall(b, players, tuning, rng, TICK, events);
    report.ticks++;
    for (const e of events) if (!first && e.type !== 'floor') first = e.type;
    if (b.out) {
      report.count(`${c.group}.out`);
      if (b.z < RINK.boardHeight) report.add(`${c.group}.outBelowBoardTop`, seed, tick, `out at z ${fmt(b.z, 2)}`);
      break;
    }
    const g = ballGeometry(b);
    const where = `${c.group} from ${fmt(c.x, 2)},${fmt(c.y, 2)},${fmt(c.z, 2)} to ${fmt(c.tx, 2)},${fmt(c.ty, 2)},${fmt(c.tz, 2)} at ${c.speed} m/s; tick ${tick} ball ${fmt(b.x, 3)},${fmt(b.y, 3)},${fmt(b.z, 3)}`;
    if (g.below) report.add('sweep.belowFloor', seed, tick, where);
    report.peak('sweep.beyondBoardLine', g.beyond);
    if (g.beyond > 1e-3) report.add('sweep.beyondBoards', seed, tick, `${fmt(g.beyond)} m; ${where}`);
    report.peak('sweep.framePen', g.frame);
    if (g.frame > 2e-3) report.add('sweep.inPost', seed, tick, `${fmt(g.frame)} m; ${where}`);
    report.peak('sweep.cageBoxPen', g.box);
    if (g.box > 2e-3) report.add('sweep.inCageNet', seed, tick, `${fmt(g.box)} m; ${where}`);
    if (g.ghost) report.add('sweep.inCageNotGoal', seed, tick, where);
    if (g.inGoalBad) report.add('sweep.inGoalOutOfCage', seed, tick, where);
    if (b.inGoal !== 0 && pIn === 0) {
      const side = b.inGoal;
      const gx = goalLineX(side);
      const u0 = side * (px - gx);
      const u1 = side * (b.x - gx);
      const f = u0 <= 0 && u1 > u0 ? -u0 / (u1 - u0) : u0 <= R ? 0 : Number.NaN;
      const cy = py + (b.y - py) * f;
      const cz = pz + (b.z - pz) * f;
      if (!(Math.abs(cy) < HW + 0.05 && cz < H + 0.05)) report.add('sweep.goalNotThroughMouth', seed, tick, where);
    }
    px = b.x;
    py = b.y;
    pz = b.z;
    pIn = b.inGoal;
    if (b.scored && tick > 0) break;
    if (Math.hypot(b.vx, b.vy, b.vz) < 0.2 && b.z <= R + 1e-3) break;
  }
  report.games++;
  report.count(`${c.group}.shots`);
  report.count(`${c.group}.first.${first || 'nothing'}`);
  if (b.scored) report.count(`${c.group}.goal`);
  if (c.expect && first !== c.expect && !(c.expect === 'goal' && b.scored)) {
    report.add(`${c.group}.missedExpected`, seed, 0, `expected ${c.expect}, first ${first || 'nothing'}${b.scored ? ' (goal)' : ''}; from ${fmt(c.x, 2)},${fmt(c.y, 2)},${fmt(c.z, 2)} to ${fmt(c.tx, 3)},${fmt(c.ty, 3)},${fmt(c.tz, 3)} at ${c.speed}`);
  }
}

const DEG = Math.PI / 180;

/** The deterministic sweep: posts, crossbar, outside of the cages, boards and corners, the mouth, and squeezes against players. */
export function sweepCases(speeds: readonly number[], lcgSeed = 4242, monteCarlo = 1): SweepCase[] {
  const out: SweepCase[] = [];
  const r = new Lcg(lcgSeed);
  for (const side of [-1, 1] as const) {
    const gx = goalLineX(side);
    const fx = gx + side * PR;
    // Posts: across each post, low to high, from every direction in front and from the side/behind (its outer face).
    for (const post of [-1, 1] as const) {
      const py = post * (HW + PR);
      for (let a = -85; a <= 175; a += 5) {
        if (a > 85 && a < 95) continue;
        for (let o = -3; o <= 3; o++) {
          for (const z of [R, 0.5, H - 0.05]) {
            for (const speed of speeds) {
              // a: direction the ball comes from, measured from the goal axis pointing at the field, towards the post's own side.
              const th = a * DEG;
              const dist = 6;
              const tx = fx;
              const ty = py + (o / 3) * (PR + R) * 0.98;
              const x = tx - side * dist * Math.cos(th);
              const y = ty + post * dist * Math.sin(th);
              if (boardSignedDistance(x, y, nrm) > -0.3) continue;
              out.push({ group: 'post', x, y, z: R, tx, ty, tz: z, speed, expect: o === 0 && a >= -20 && a <= 85 ? 'post' : '' });
            }
          }
        }
      }
    }
    // Crossbar: across it (z), along it (y), from the front within ±60°.
    for (let a = -60; a <= 60; a += 10) {
      for (let o = -3; o <= 3; o++) {
        for (const yy of [-0.6, -0.3, 0, 0.3, 0.6]) {
          for (const speed of speeds) {
            const th = a * DEG;
            const dist = 7;
            const tz = TOP + (o / 3) * (PR + R) * 0.98;
            out.push({ group: 'bar', x: fx - side * dist * Math.cos(th), y: yy + dist * Math.sin(th), z: R, tx: fx, ty: yy, tz, speed, expect: o === 0 && Math.abs(a) <= 30 ? 'post' : '' });
          }
        }
      }
    }
    // The mouth: anywhere inside it, from within ±70°: a goal (or a post first).
    for (let i = 0; i < 400 * monteCarlo; i++) {
      const th = r.range(-70, 70) * DEG;
      const dist = r.range(2, 12);
      const ty = r.range(-HW + R + 0.01, HW - R - 0.01);
      const tz = r.range(R, H - R - 0.01);
      const x = gx - side * dist * Math.cos(th);
      const y = ty + dist * Math.sin(th);
      if (boardSignedDistance(x, y, nrm) > -0.3) continue;
      out.push({ group: 'mouth', x, y, z: R, tx: gx, ty, tz, speed: speeds[i % speeds.length]!, expect: 'goal' });
    }
    // Outside of the cage: side nets, back and roof, from outside.
    for (let i = 0; i < 700 * monteCarlo; i++) {
      const face = r.int(3);
      let tx: number;
      let ty: number;
      let tz: number;
      let x: number;
      let y: number;
      if (face === 0) {
        // Side net, from a closed angle or from behind.
        const s = r.chance(0.5) ? 1 : -1;
        tx = gx + side * r.range(0.05, D);
        ty = s * (HW + PR);
        tz = r.range(R, H);
        const th = r.range(10, 170) * DEG;
        x = tx - side * 5 * Math.cos(th);
        y = ty + s * 5 * Math.sin(th);
      } else if (face === 1) {
        // Back of the cage, from behind the goal.
        tx = gx + side * (D + PR);
        ty = r.range(-HW, HW);
        tz = r.range(R, H);
        const th = r.range(-70, 70) * DEG;
        x = tx + side * 1.5 * Math.cos(th);
        y = ty + 1.5 * Math.sin(th);
      } else {
        // Roof: a flat shot skimming it from the front.
        tx = gx + side * r.range(0.05, D);
        ty = r.range(-HW, HW);
        tz = TOP + r.range(0, 0.1);
        const th = r.range(-40, 40) * DEG;
        x = tx - side * 8 * Math.cos(th);
        y = ty + 8 * Math.sin(th);
      }
      if (boardSignedDistance(x, y, nrm) > -0.1) continue;
      out.push({ group: 'cage', x, y, z: R, tx, ty, tz, speed: speeds[i % speeds.length]!, expect: '' });
    }
    // Squeezes: 1-3 skaters around a post / the side of a cage / the board behind it, the ball fired into the crowd.
    for (let i = 0; i < 300 * monteCarlo; i++) {
      const tx = gx + side * r.range(-0.6, D + 0.6);
      const ty = (r.chance(0.5) ? 1 : -1) * r.range(0.3, 2);
      const players: SweepCase['players'] = [];
      for (let k = 0, m = 1 + r.int(3); k < m; k++) players.push({ x: tx + r.range(-0.8, 0.8), y: ty + r.range(-0.8, 0.8), vx: r.range(-6, 6), vy: r.range(-6, 6) });
      const th = r.range(-80, 80) * DEG;
      const x = tx - side * 6 * Math.cos(th);
      const y = ty + 6 * Math.sin(th);
      if (boardSignedDistance(x, y, nrm) > -0.3) continue;
      out.push({ group: 'squeeze', x, y, z: R, tx, ty, tz: r.range(R, 0.6), speed: speeds[i % speeds.length]!, expect: '', players });
    }
  }
  // Boards and corners: points all round the boards (corners weighted up), low to just over the top.
  const hx = RINK.length / 2;
  const hy = RINK.width / 2;
  const cr = RINK.cornerRadius;
  for (let i = 0; i < 2500 * monteCarlo; i++) {
    let tx: number;
    let ty: number;
    let nx: number;
    let ny: number;
    const where = r.int(4);
    if (where === 0) {
      // A corner arc.
      const sx = r.chance(0.5) ? 1 : -1;
      const sy = r.chance(0.5) ? 1 : -1;
      const a = r.range(0, Math.PI / 2);
      nx = sx * Math.cos(a);
      ny = sy * Math.sin(a);
      tx = sx * (hx - cr) + nx * cr;
      ty = sy * (hy - cr) + ny * cr;
    } else if (where === 1) {
      const sx = r.chance(0.5) ? 1 : -1;
      tx = sx * hx;
      ty = r.range(-hy + cr, hy - cr);
      nx = sx;
      ny = 0;
    } else {
      const sy = r.chance(0.5) ? 1 : -1;
      tx = r.range(-hx + cr, hx - cr);
      ty = sy * hy;
      nx = 0;
      ny = sy;
    }
    const tz = r.chance(0.7) ? r.range(R, 0.9) : r.range(0.9, 1.2);
    const th = Math.atan2(-ny, -nx) + r.range(-80, 80) * DEG;
    const dist = r.range(1, 10);
    // Start inside the rink, `dist` m back along the incoming direction.
    const x = tx + Math.cos(th) * dist;
    const y = ty + Math.sin(th) * dist;
    if (boardSignedDistance(x, y, nrm) > -0.3) continue;
    // Not through a goal cage on the way (that is the other groups' job).
    let blocked = false;
    for (const box of GOAL_BOXES) {
      for (let s = 0; s <= 20; s++) {
        const qx = x + (tx - x) * (s / 20);
        const qy = y + (ty - y) * (s / 20);
        if (qx > box.minX - 0.3 && qx < box.maxX + 0.3 && qy > box.minY - 0.3 && qy < box.maxY + 0.3) blocked = true;
      }
    }
    if (blocked) continue;
    out.push({ group: where === 0 ? 'corner' : 'board', x, y, z: R, tx: tx - nx * R, ty: ty - ny * R, tz, speed: speeds[i % speeds.length]!, expect: tz < 0.9 ? 'board' : '' });
  }
  return out;
}

// --- Loop (game speed, slow-mo) --------------------------------------------------------------

export type FrameProfile = 'f30' | 'f60' | 'f144' | 'hitch';

/** Frame time (s) of frame `i` for a profile; 'hitch' = 60 fps with jitter, 0 ms frames and 4 % hitches of 50-400 ms. */
export function frameTime(profile: FrameProfile, r: Lcg): number {
  if (profile === 'f30') return 1 / 30;
  if (profile === 'f60') return 1 / 60;
  if (profile === 'f144') return 1 / 144;
  const u = r.next();
  if (u < 0.04) return r.range(0.05, 0.4);
  if (u < 0.06) return 0;
  return 1 / 60 + r.range(-0.002, 0.002);
}

// --- Tuning fuzz (values the mobile panel allows) --------------------------------------------

/** A copy of the factory tuning with `path` at its panel minimum or maximum (src/config/tuningMeta.ts). */
export function tuningAtExtreme(path: string, end: 'min' | 'max'): Tuning {
  const t = structuredClone(TUNING);
  const m = TUNING_PARAMS.find((p) => p.path === path)!;
  setAt(t, path, (end === 'min' ? m.min : m.max) / (m.scale ?? 1));
  return t;
}

/** A copy of the factory tuning with every panel value random in its range (a quarter at each end). */
export function tuningRandom(r: Lcg): Tuning {
  const t = structuredClone(TUNING);
  for (const m of TUNING_PARAMS) {
    const u = r.next();
    const v = m.toggle ? (u < 0.5 ? 0 : 1) : u < 0.25 ? m.min : u < 0.5 ? m.max : r.range(m.min, m.max);
    setAt(t, m.path, v / (m.scale ?? 1));
  }
  return t;
}

// --- Targeted reproductions of the findings (docs/audit/B.md) --------------------------------

/** Ball loose at the controlled player's blade, carried on the stick for a late release (TIRO held). */
function holdOnStick(w: WorldState, tuning: Tuning, holdHeight: number): void {
  const p = w.players[w.controlled]!;
  const blade = bladePoint(p, tuning);
  const b = w.ball;
  b.owner = -1;
  b.x = b.prevX = blade.x;
  b.y = b.prevY = blade.y;
  b.z = b.prevZ = R + holdHeight;
  b.vx = b.vy = b.vz = 0;
  const v = w.volley;
  v.found = v.incoming = v.open = true;
  v.contactTick = w.tick;
  v.hold = Math.max(1, Math.round((tuning.volley.windowTime / 2) * tuning.sim.tickRate));
  v.holdHeight = holdHeight;
  v.inVx = 8;
  v.inVy = v.inVz = 0;
  p.shotHold = 0.3;
  p.shotWithBall = false;
}

/** F1: CANVI while the stick carries a volley (late release): how far the ball moves in that tick. */
export function reproSwitchDuringHold(): { jump: number; from: number; to: number; jumpWithoutSwitch: number } {
  const t = structuredClone(TUNING);
  const run = (sw: boolean): { jump: number; from: number; to: number } => {
    const w = createWorld(3, 2);
    holdOnStick(w, t, 0.5);
    const held = { ...emptyCommand(), shootHeld: true };
    stepWorld(w, [held], t);
    const x = w.ball.x;
    const y = w.ball.y;
    const from = w.controlled;
    stepWorld(w, [{ ...held, switchPlayer: sw }], t);
    return { jump: Math.hypot(w.ball.x - x, w.ball.y - y), from, to: w.controlled };
  };
  const a = run(true);
  return { ...a, jumpWithoutSwitch: run(false).jump };
}

/** F2: the late release held facing a board: how far beyond the board line the ball gets, and whether it ends "out" when it drops. */
export function reproHoldAtBoard(holdHeight: number): { beyond: number; out: boolean } {
  const t = structuredClone(TUNING);
  const w = createWorld(3, 2);
  const p = w.players[0]!;
  p.x = p.prevX = 2;
  p.y = p.prevY = RINK.width / 2 - t.skating.radius - 0.01;
  p.heading = p.prevHeading = Math.PI / 2;
  holdOnStick(w, t, holdHeight);
  const held = { ...emptyCommand(), shootHeld: true };
  let beyond = Number.NEGATIVE_INFINITY;
  let out = false;
  for (let i = 0; i < 30; i++) {
    stepWorld(w, [held], t);
    beyond = Math.max(beyond, boardSignedDistance(w.ball.x, w.ball.y, nrm));
    if (w.events.some((e) => e.type === 'out')) out = true;
  }
  return { beyond, out };
}

/** F3: the ball goes out over the boards while the controlled player faces a goal from 0.8 m: where it is put back, and how far it is thrown next tick. */
export function reproOutRespawnInGoal(): { x: number; y: number; insideCage: boolean; nextJump: number } {
  const t = structuredClone(TUNING);
  const w = createWorld(3, 2);
  const p = w.players[0]!;
  p.x = p.prevX = goalLineX(1) - 0.8;
  p.y = p.prevY = 0.3;
  p.heading = p.prevHeading = 0;
  const b = w.ball;
  b.x = b.prevX = 0;
  b.y = b.prevY = RINK.width / 2 - 0.05;
  b.z = b.prevZ = 1.5;
  b.vx = b.vz = 0;
  b.vy = 6;
  const idle = emptyCommand();
  for (let i = 0; i < 5 && !w.events.some((e) => e.type === 'out'); i++) stepWorld(w, [idle], t);
  const x = b.x;
  const y = b.y;
  const insideCage = inCage(b, 1) || cageBoxPen(b, 1) > 0;
  stepWorld(w, [idle], t);
  return { x, y, insideCage, nextJump: Math.hypot(b.x - x, b.y - y) };
}

/** F4: module scratch shared by every world: a world with no ball coming gets another world's volley time. */
export function reproScratchLeak(): { quiet: number; afterOther: number; otherTime: number } {
  const t = structuredClone(TUNING);
  const quiet = createWorld(5, 2);
  const busy = createWorld(6, 2);
  // A ball in the air coming straight at busy's controlled player's blade.
  const p = busy.players[0]!;
  const blade = bladePoint(p, t);
  busy.ball.x = blade.x + 3;
  busy.ball.y = blade.y;
  busy.ball.z = R + 0.6;
  busy.ball.vx = -12;
  busy.ball.vy = 0;
  busy.ball.vz = 1;
  const idle = emptyCommand();
  stepWorld(quiet, [idle], t);
  const q = quiet.volley.time;
  stepWorld(busy, [idle], t);
  const other = busy.volley.time;
  stepWorld(quiet, [idle], t);
  return { quiet: q, afterOther: quiet.volley.time, otherTime: other };
}

/**
 * F6 (from §A): a driven pass (PASE tapped with the height "alt fort") of `dist` m to a teammate
 * standing at (6, 2); the control switches to him as it leaves, the thumb leaves the stick for 3 ticks and then holds it
 * towards the goal (≈145° away from where the ball comes from) or releases it. Did he get it?
 */
export function reproDrivenPass(dist: number, stick: 'goal' | 'released'): { passAir: number; received: boolean; touched: boolean; closest: number } {
  const t = structuredClone(TUNING);
  const w = createWorld(3, 2);
  const th = (25 * Math.PI) / 180;
  const rx = 6;
  const ry = 2;
  const [p0, p1, p2] = w.players as [PlayerState, PlayerState, PlayerState];
  p0.x = p0.prevX = rx - Math.cos(th) * dist;
  p0.y = p0.prevY = ry - Math.sin(th) * dist;
  p0.heading = p0.prevHeading = th;
  p1.x = p1.prevX = rx;
  p1.y = p1.prevY = ry;
  p1.heading = p1.prevHeading = th + Math.PI;
  p2.x = p2.prevX = -15;
  p2.y = p2.prevY = 8;
  const b = w.ball;
  const blade = bladePoint(p0, t);
  b.x = b.prevX = blade.x;
  b.y = b.prevY = blade.y;
  b.owner = 0;
  const cmd = { ...emptyCommand(), moveX: Math.cos(th) * 0.5, moveY: Math.sin(th) * 0.5, pass: true, passHeight: 1 };
  stepWorld(w, [cmd], t);
  const passAir = w.passAir;
  let received = false;
  let touched = false;
  let closest = Number.POSITIVE_INFINITY;
  const gx = goalLineX(1);
  for (let i = 0; i < 240 && !received; i++) {
    const me = w.players[w.controlled]!;
    const a = Math.atan2(-me.y, gx - me.x);
    // The thumb leaves the stick for 3 ticks after the pass (the stick latch of the switch ends), then aims at the goal.
    const c = stick === 'goal' && i >= 3 ? { ...emptyCommand(), moveX: Math.cos(a), moveY: Math.sin(a), passHeight: 1 } : { ...emptyCommand(), passHeight: 1 };
    const before = w.lastReceptionTick;
    stepWorld(w, [c], t);
    if (w.lastReceptionTick !== before && w.lastReceptionPlayer === 1) touched = true;
    if (w.ball.owner === 1) received = touched = true;
    const bl = bladePoint(p1, t);
    closest = Math.min(closest, Math.hypot(w.ball.x - bl.x, w.ball.y - bl.y));
  }
  return { passAir, received, touched, closest };
}

/** F5: carrying the ball against the back of a cage: how deep it ends inside the ball physics' cage box (two cage models), and the pop when it is let go. */
export function reproCageModels(): { carriedBoxPen: number; popOnRelease: number } {
  const t = structuredClone(TUNING);
  const w = createWorld(3, 0);
  const p = w.players[0]!;
  p.x = p.prevX = goalLineX(1) + D + 0.9;
  p.y = p.prevY = 0.3;
  p.heading = p.prevHeading = Math.PI;
  const b = w.ball;
  const blade = bladePoint(p, t);
  b.x = b.prevX = blade.x;
  b.y = b.prevY = blade.y;
  b.owner = 0;
  const push = { ...emptyCommand(), moveX: -1 };
  let pen = Number.NEGATIVE_INFINITY;
  let deepest: BallState | null = null;
  for (let i = 0; i < 40; i++) {
    stepWorld(w, [push], t);
    const d = cageBoxPen(b, 1);
    if (d > pen) {
      pen = d;
      deepest = structuredClone(b);
    }
  }
  // Let go of it where it was deepest (as a loss would) and watch one tick of ball physics.
  const c = deepest ?? structuredClone(b);
  c.owner = -1;
  c.vx = c.vy = 0;
  const x = c.x;
  const y = c.y;
  stepBall(c, [], t, createRng(1), TICK, []);
  return { carriedBoxPen: pen, popOnRelease: Math.hypot(c.x - x, c.y - y) };
}
