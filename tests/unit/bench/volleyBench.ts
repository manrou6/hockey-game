import { goalLineX, RINK } from '../../../src/config/rink';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { pickUp } from '../../../src/sim/dribble';
import { dribbleFor, shotFor } from '../../../src/sim/feel';
import type { AssistLevel } from '../../../src/sim/pass';
import { RECEIVE_CLEAN, RECEIVE_HEAVY, RECEIVE_MISS, RECEIVE_REBOUND } from '../../../src/sim/receive';
import { createWorld, stepWorld, type WorldState } from '../../../src/sim/world';

// Volley bench (F1.5d): a teammate's real pass (driven lofted, lob or ground) to the human's
// receiver near the goal, the control switching to him as the pass leaves (FIFA-like); then the
// human taps TIRO aiming at a zone, releasing it around the moment the ball gets to him with a
// human timing error (gaussian, sd = `timing`). Deterministic (seeded). Run with
//   PATINS_BENCH=1 npx vitest run tests/unit/bench/volley
// Not part of the normal test run (see volleyBench.test.ts).

const TICK = 1 / 60;
const GX = goalLineX(1);
const R = RINK.ballRadius;
/** Human thumb error on the stick angle (±rad, uniform): as the other benches. */
const THUMB_ERROR = 0.12;

export type PassType = 'drive' | 'lob' | 'ground';
const PASS_HEIGHT: Record<PassType, number> = { ground: 0, drive: 1, lob: 2 };

export interface VolleyCase {
  pass: PassType;
  /** Passer to receiver (m); receiver to the centre of the goal (m) and angle off its axis (deg). */
  passDist: number;
  dist: number;
  angle: number;
  /** Human release timing error (sd, s) around the moment he aims at. */
  timing: number;
  /** He aims his release this long before the ball reaches him (s): "just before" without a cue. */
  aimLead: number;
  /** Tap (0.1 s, low) or the diagonal drag for a high shot (held 0.25 s). */
  gesture: 'tap' | 'drag';
  /** He points the joystick at a zone just before shooting (default), or never touches it (far post). */
  aim?: 'zone' | 'none';
  /** He follows the TIR button's cue (F1.5d) instead of the ball's arrival. */
  followCue?: boolean;
  /** Where the pass comes from: behind him and to a side (default), from the side, or from the
   * front-side (a pass back from near the goal line / the corner); or straight from behind
   * (almost on the goal axis: the pass is exactly passDist long, for the flight profile). */
  from?: 'back' | 'side' | 'front' | 'behind';
}

export interface VolleyStats {
  n: number;
  /** Where the ball is when it is closest to him: mean height above the floor (m), % of
   * passes reaching him at ≤ dribble.pickupMaxHeight (controllable), at ≤ 1.05 m, relative speed. */
  height: number;
  low: number;
  underBar: number;
  relSpeed: number;
  /** Without pressing TIRO: what the reception does (% clean / heavy / rebound / miss / never touched). */
  rxClean: number;
  rxHeavy: number;
  rxRebound: number;
  rxMiss: number;
  rxNone: number;
  /** Pressing TIRO: % that ended in a shot, % on target, % in the zone; mean speed at the goal line. */
  shot: number;
  onTarget: number;
  inZone: number;
  speedAtGoal: number;
  /** Why no shot (% of all): never reached his stick / the reception failed / released too early
   * (before the ball came) / too late (after the first-touch window). */
  failNoTouch: number;
  failReception: number;
  failEarly: number;
  failLate: number;
  /** Seconds from the pass leaving to the shot (mean) and % of the shots that were aerial strikes. */
  passToShot: number;
  aerial: number;
  /** % of the shots with good timing (aerial strikes only, from the world's last shot). */
  goodTiming: number;
  /** % on target of the aerial strikes with good / bad timing; mean contact height of the strikes (m). */
  onGood: number;
  onBad: number;
  strikeHeight: number;
  /** % of the aerial strikes with the ball below 0.15 m (not really in the air: F1.5e), and below 0.3 m. */
  strikeLow: number;
  strikeLow30: number;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Approximately normal deviate from a uniform source. */
function normal(rnd: () => number): number {
  return (rnd() + rnd() + rnd() + rnd() - 2) * Math.sqrt(3);
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);

interface Setup {
  w: WorldState;
  /** The receiver's index, where he stands, the zone wanted on the goal. */
  rx: number;
  wantY: number;
  u: number;
  noise: number;
}

/** Passer (player 0, controlled) with the ball, receiver (player 1) near the goal facing him. */
function setup(c: VolleyCase, seed: number): Setup {
  const rnd = lcg(seed * 7919 + c.dist * 17 + c.angle * 3 + c.passDist);
  const w = createWorld(seed, 1);
  const sideY = seed % 2 ? 1 : -1;
  const th = ((c.angle * Math.PI) / 180) * sideY;
  const rxX = GX - c.dist * Math.cos(th);
  const rxY = c.dist * Math.sin(th);
  const toGoal = Math.atan2(-rxY, GX - rxX);
  // The pass comes from behind him and to the side (a cross from the wing / the back), from the
  // side, or from the front-side (back from the corner).
  const spread = 0.6 + 0.4 * rnd();
  const fromDir =
    c.from === 'side'
      ? toGoal + sideY * (Math.PI / 2 + (spread - 0.8) * 0.5)
      : c.from === 'front'
        ? toGoal + sideY * (spread - 0.1)
        : c.from === 'behind'
          ? toGoal + Math.PI + sideY * spread * 0.25
          : toGoal + Math.PI + sideY * spread;
  let px = rxX + Math.cos(fromDir) * c.passDist;
  let py = rxY + Math.sin(fromDir) * c.passDist;
  py = Math.max(-RINK.width / 2 + 1.2, Math.min(RINK.width / 2 - 1.2, py));
  px = Math.max(-RINK.length / 2 + 2, px);
  const passer = w.players[0]!;
  const rec = w.players[1]!;
  const toRec = Math.atan2(rxY - py, rxX - px);
  passer.x = passer.prevX = px;
  passer.y = passer.prevY = py;
  passer.heading = passer.prevHeading = toRec;
  passer.vx = passer.vy = 0;
  rec.x = rec.prevX = rxX;
  rec.y = rec.prevY = rxY;
  rec.heading = rec.prevHeading = toRec + Math.PI;
  rec.vx = rec.vy = 0;
  const d = dribbleFor(passer, TUNING);
  w.ball.x = w.ball.prevX = px + Math.cos(toRec) * d.stickForward + Math.sin(toRec) * d.stickSide;
  w.ball.y = w.ball.prevY = py + Math.sin(toRec) * d.stickForward - Math.cos(toRec) * d.stickSide;
  pickUp(w.ball, 0, passer);
  w.controlled = 0;
  const u = Math.floor(rnd() * 3) - 1;
  return { w, rx: 1, wantY: u * (RINK.goalWidth / 3), u, noise: (rnd() * 2 - 1) * THUMB_ERROR };
}

/** The human's command: before the pass leaves, the pass (a tap aimed at the receiver); after, the receiver aiming at the zone. */
function humanCmd(s: Setup, c: VolleyCase, level: AssistLevel, tuning: Tuning, i: number, shoot: { press: number; release: number } | null): PlayerCommand {
  const w = s.w;
  const k = shotFor({} as never, tuning);
  const half = RINK.goalWidth / 2 - k.postMargin;
  const range = level === 'strong' ? k.strongAimRange : level === 'light' ? k.lightAimRange : k.mediumAimRange;
  if (w.controlled === 0) {
    const rec = w.players[s.rx]!;
    const a = Math.atan2(rec.y - w.ball.y, rec.x - w.ball.x);
    return { ...emptyCommand(), moveX: Math.cos(a) * 0.3, moveY: Math.sin(a) * 0.3, pass: i === 0, passHeld: i < 5, passHeight: PASS_HEIGHT[c.pass] };
  }
  const p = w.players[w.controlled]!;
  const bx = w.ball.owner === w.controlled ? w.ball.x : p.x;
  const by = w.ball.owner === w.controlled ? w.ball.y : p.y;
  const toCentre = Math.atan2(-by, GX - bx);
  const aim = level === 'off' ? Math.atan2(s.wantY - by, GX - bx) + s.noise : toCentre + Math.max(-1, Math.min(1, s.wantY / half)) * range + s.noise;
  // He lets go of the joystick while the ball comes (the receiver goes to meet it on his own,
  // docs/03 §2) and points it at the zone just before shooting (option A reads it at the release).
  const aiming = shoot !== null && i >= shoot.press - 3 && c.aim !== 'none';
  const cmd: PlayerCommand = { ...emptyCommand(), moveX: aiming ? Math.cos(aim) * 0.15 : 0, moveY: aiming ? Math.sin(aim) * 0.15 : 0 };
  if (shoot && i >= shoot.press && i <= shoot.release) {
    cmd.shoot = i === shoot.press;
    cmd.shootHeld = i < shoot.release;
    cmd.shootHeight = c.gesture === 'drag' && i - shoot.press >= 3 ? 1 : 0;
  }
  return cmd;
}

interface DryRun {
  /** Tick the pass left, tick the ball was closest to the receiver (−1 = never within 1.2 m). */
  passTick: number;
  contactTick: number;
  /** With the remate en el aire (F1.5d): the tick its cue says the ball gets to his stick (−1 = no cue). */
  cueTick: number;
  height: number;
  relSpeed: number;
  outcome: number;
  /** Highest the ball flew (above the floor, m) from the pass to the contact; passer to receiver (m). */
  apex: number;
  passLen: number;
}

/** The pass alone (nobody presses TIRO): when and how the ball gets to the receiver. */
function dryRun(c: VolleyCase, level: AssistLevel, tuning: Tuning, seed: number): DryRun {
  const s = setup(c, seed);
  const w = s.w;
  w.assist = level;
  const out: DryRun = { passTick: -1, contactTick: -1, cueTick: -1, height: Number.NaN, relSpeed: Number.NaN, outcome: -1, apex: 0, passLen: Math.hypot(w.players[0]!.x - w.players[s.rx]!.x, w.players[0]!.y - w.players[s.rx]!.y) };
  let best = Infinity;
  let prevZ = R;
  let prevRel = Number.NaN;
  let cushioned = false;
  const cw = w as unknown as { lastCushionTick?: number; lastCushionPlayer?: number };
  for (let i = 0; i < 240; i++) {
    const r0 = w.players[s.rx]!;
    prevZ = w.ball.z;
    prevRel = Math.hypot(w.ball.vx - r0.vx, w.ball.vy - r0.vy);
    stepWorld(w, [humanCmd(s, c, level, tuning, i, null)], tuning);
    if (out.passTick < 0 && w.ball.owner < 0) out.passTick = i;
    if (out.passTick < 0) continue;
    if (w.ball.owner < 0) out.apex = Math.max(out.apex, prevZ - R, w.ball.z - R);
    const r = w.players[s.rx]!;
    const view = (w as unknown as { volley?: { found: boolean; time: number } }).volley;
    if (!cushioned && view?.found && w.controlled === s.rx) out.cueTick = i + Math.round(view.time / TICK);
    // A driven pass blocked in the air (F1.5e): the contact is there, the reception comes once it drops.
    if (!cushioned && cw.lastCushionPlayer === s.rx && cw.lastCushionTick === w.tick - 1) {
      cushioned = true;
      out.contactTick = i;
      out.height = w.ball.z - R;
      out.relSpeed = prevRel;
    }
    if (w.lastReceptionPlayer === s.rx && w.lastReceptionTick === w.tick - 1 && out.outcome < 0) {
      out.outcome = w.lastReceptionOutcome;
      if (!cushioned) {
        // Where the ball was when he got it: the reception's own tick (before it was picked up).
        out.contactTick = i;
        out.height = prevZ - R;
        out.relSpeed = prevRel;
      }
      break;
    }
    if (cushioned) continue;
    if (w.ball.owner >= 0) break;
    const dist = Math.hypot(w.ball.x - r.x, w.ball.y - r.y);
    if (dist < best && dist <= 1.2) {
      best = dist;
      out.contactTick = i;
      out.height = w.ball.z - R;
      out.relSpeed = Math.hypot(w.ball.vx - r.vx, w.ball.vy - r.vy);
    } else if (out.contactTick >= 0 && dist > best + 0.5) break;
  }
  return out;
}

export function runVolley(tuning: Tuning, level: AssistLevel, c: VolleyCase, n = 200): VolleyStats {
  const st: VolleyStats = {
    n, height: 0, low: 0, underBar: 0, relSpeed: 0, rxClean: 0, rxHeavy: 0, rxRebound: 0, rxMiss: 0, rxNone: 0,
    shot: 0, onTarget: 0, inZone: 0, speedAtGoal: Number.NaN, failNoTouch: 0, failReception: 0, failEarly: 0, failLate: 0,
    passToShot: Number.NaN, aerial: 0, goodTiming: Number.NaN, onGood: Number.NaN, onBad: Number.NaN, strikeHeight: Number.NaN,
    strikeLow: Number.NaN,
    strikeLow30: Number.NaN,
  };
  let goodOn = 0;
  let bad = 0;
  let badOn = 0;
  const strikeHeights: number[] = [];
  const heights: number[] = [];
  const rel: number[] = [];
  const speeds: number[] = [];
  const delays: number[] = [];
  let good = 0;
  let aerial = 0;
  const maxH = dribbleFor({} as never, tuning).pickupMaxHeight;
  const hold = c.gesture === 'drag' ? 15 : 6;
  for (let seed = 1; seed <= n; seed++) {
    const dry = dryRun(c, level, tuning, seed);
    if (dry.outcome === RECEIVE_CLEAN) st.rxClean++;
    else if (dry.outcome === RECEIVE_HEAVY) st.rxHeavy++;
    else if (dry.outcome === RECEIVE_REBOUND) st.rxRebound++;
    else if (dry.outcome === RECEIVE_MISS) st.rxMiss++;
    else st.rxNone++;
    if (dry.contactTick < 0) {
      st.failNoTouch++;
      continue;
    }
    heights.push(dry.height);
    if (!Number.isNaN(dry.relSpeed)) rel.push(dry.relSpeed);
    if (dry.height <= maxH) st.low++;
    if (dry.height + R <= RINK.goalHeight) st.underBar++;
    // The human: releases around (contact − aimLead), with his timing error.
    const rnd = lcg(seed * 104729 + 7);
    // With a cue (the TIR arc full = the ball at his stick) he aims at it; without one, at the arrival.
    const target = c.followCue && dry.cueTick >= 0 ? dry.cueTick : dry.contactTick;
    const release = Math.max(dry.passTick + 2, Math.round(target - c.aimLead / TICK + (normal(rnd) * c.timing) / TICK));
    const press = Math.max(dry.passTick + 1, release - hold);
    const s = setup(c, seed);
    const w = s.w;
    w.assist = level;
    const startShot = w.lastShotTick;
    let left = -1;
    let gotTick = -1;
    let gotOutcome = -1;
    for (let i = 0; i < 240 && left < 0; i++) {
      stepWorld(w, [humanCmd(s, c, level, tuning, i, { press, release })], tuning);
      if (gotTick < 0 && w.lastReceptionPlayer === s.rx && w.lastReceptionTick === w.tick - 1) {
        gotTick = i;
        gotOutcome = w.lastReceptionOutcome;
      }
      if (w.lastShotTick !== startShot && w.lastShotPlayer === s.rx) left = i;
      if (i > release + 40 && left < 0) break;
    }
    if (left < 0) {
      const buffer = Math.round(tuning.input.bufferTime / TICK);
      const window = Math.round(tuning.receive.firstTouchWindow / TICK);
      if (gotTick < 0) st.failNoTouch++;
      else if (gotOutcome === RECEIVE_REBOUND || gotOutcome === RECEIVE_MISS) st.failReception++;
      else if (release < gotTick - buffer) st.failEarly++;
      else if (release > gotTick + window) st.failLate++;
      else st.failLate++;
      continue;
    }
    st.shot++;
    delays.push((left - dry.passTick) * TICK);
    const shotInfo = w.lastShot as { aerial?: boolean; timing?: number; contactHeight?: number };
    let isGood = false;
    let isBad = false;
    if (shotInfo.aerial) {
      aerial++;
      strikeHeights.push(shotInfo.contactHeight ?? Number.NaN);
      if (Math.abs(shotInfo.timing ?? 1) <= tuningGood(tuning) + 1e-9) {
        good++;
        isGood = true;
      } else {
        bad++;
        isBad = true;
      }
    }
    for (let i = 0; i < 240; i++) {
      const bx = w.ball.x;
      const by = w.ball.y;
      const bz = w.ball.z;
      stepWorld(w, [emptyCommand()], tuning);
      if (w.events.some((e) => e.type === 'post')) break;
      if (bx < GX && w.ball.x >= GX) {
        const f = (GX - bx) / (w.ball.x - bx);
        const y = by + (w.ball.y - by) * f;
        const z = bz + (w.ball.z - bz) * f;
        if (Math.abs(y) <= RINK.goalWidth / 2 - R && z <= RINK.goalHeight - R) {
          st.onTarget++;
          if (isGood) goodOn++;
          if (isBad) badOn++;
          speeds.push(Math.hypot(w.ball.vx, w.ball.vy, w.ball.vz));
          const third = RINK.goalWidth / 6;
          const lat = y > third ? 1 : y < -third ? -1 : 0;
          if (lat === s.u) st.inZone++;
        }
        break;
      }
      if (w.ball.owner >= 0 || Math.hypot(w.ball.vx, w.ball.vy) < 0.5) break;
    }
  }
  const pct = (x: number): number => (100 * x) / n;
  st.rxClean = pct(st.rxClean);
  st.rxHeavy = pct(st.rxHeavy);
  st.rxRebound = pct(st.rxRebound);
  st.rxMiss = pct(st.rxMiss);
  st.rxNone = pct(st.rxNone);
  st.height = mean(heights);
  st.relSpeed = mean(rel);
  st.low = pct(st.low);
  st.underBar = pct(st.underBar);
  st.shot = pct(st.shot);
  st.onTarget = pct(st.onTarget);
  st.inZone = pct(st.inZone);
  st.speedAtGoal = mean(speeds);
  st.failNoTouch = pct(st.failNoTouch);
  st.failReception = pct(st.failReception);
  st.failEarly = pct(st.failEarly);
  st.failLate = pct(st.failLate);
  st.passToShot = mean(delays);
  st.aerial = st.shot > 0 ? (100 * aerial) / ((st.shot * n) / 100) : Number.NaN;
  st.goodTiming = aerial > 0 ? (100 * good) / aerial : Number.NaN;
  st.onGood = good > 0 ? (100 * goodOn) / good : Number.NaN;
  st.onBad = bad > 0 ? (100 * badOn) / bad : Number.NaN;
  st.strikeHeight = mean(strikeHeights);
  st.strikeLow = strikeHeights.length ? (100 * strikeHeights.filter((h) => h < 0.15).length) / strikeHeights.length : Number.NaN;
  st.strikeLow30 = strikeHeights.length ? (100 * strikeHeights.filter((h) => h < 0.3).length) / strikeHeights.length : Number.NaN;
  return st;
}

/** The good-timing half width once the volley exists (F1.5d); before it, 0. */
function tuningGood(tuning: Tuning): number {
  const v = (tuning as unknown as { volley?: { good: number } }).volley;
  return v ? v.good : 0;
}

export function fmtVolley(s: VolleyStats): string {
  const f = (x: number): string => (Number.isNaN(x) ? '  -' : x.toFixed(0).padStart(3));
  return `ball at him ${s.height.toFixed(2)} m (≤0.35 m ${f(s.low)}%) ${s.relSpeed.toFixed(1)} m/s | no TIRO: clean ${f(s.rxClean)}% heavy ${f(s.rxHeavy)}% rebound ${f(s.rxRebound)}% miss ${f(s.rxMiss)}% untouched ${f(s.rxNone)}% | TIRO: shot ${f(s.shot)}% on target ${f(s.onTarget)}% zone ${f(s.inZone)}% ${Number.isNaN(s.speedAtGoal) ? '' : s.speedAtGoal.toFixed(1) + ' m/s'} | no shot: untouched ${f(s.failNoTouch)}% reception ${f(s.failReception)}% early ${f(s.failEarly)}% late ${f(s.failLate)}% | aerial ${f(s.aerial)}% good timing ${f(s.goodTiming)}% (on target ${f(s.onGood)}% / bad ${f(s.onBad)}%) at ${Number.isNaN(s.strikeHeight) ? '-' : s.strikeHeight.toFixed(2)} m (<0.15 m ${f(s.strikeLow)}%, <0.30 m ${f(s.strikeLow30)}%)`;
}

export const BASE_TUNING = (): Tuning => structuredClone(TUNING);

/** Heights (m above the floor) of the ball when it gets to the receiver (no TIRO): sorted. */
export function contactHeights(tuning: Tuning, level: AssistLevel, c: VolleyCase, n = 200): number[] {
  const out: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const d = dryRun(c, level, tuning, seed);
    if (d.contactTick >= 0) out.push(d.height);
  }
  return out.sort((a, b) => a - b);
}

export interface PassProfile {
  n: number;
  /** Passer to receiver (m, mean); height of the ball when it gets to him (closest or at the
   * reception, m: p10 / median / p90); % of them in the comfortable 0.3-1.0 m, below 0.15 m. */
  passLen: number;
  p10: number;
  median: number;
  p90: number;
  comfy: number;
  low: number;
  /** Highest point of the flight (m: mean, max); time from the pass to him (s, mean). */
  apex: number;
  apexMax: number;
  time: number;
}

/** How the pass flies to the receiver (no TIRO): heights, apex, flight time (F1.5e). */
export function passProfile(tuning: Tuning, level: AssistLevel, c: VolleyCase, n = 200): PassProfile {
  const h: number[] = [];
  const apex: number[] = [];
  const time: number[] = [];
  const len: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const d = dryRun(c, level, tuning, seed);
    len.push(d.passLen);
    if (d.contactTick < 0) continue;
    h.push(d.height);
    apex.push(d.apex);
    time.push((d.contactTick - d.passTick) * TICK);
  }
  h.sort((a, b) => a - b);
  const q = (f: number): number => h[Math.min(h.length - 1, Math.floor(f * h.length))] ?? Number.NaN;
  const share = (ok: (x: number) => boolean): number => (h.length ? (100 * h.filter(ok).length) / h.length : Number.NaN);
  return {
    n,
    passLen: mean(len),
    p10: q(0.1),
    median: q(0.5),
    p90: q(0.9),
    comfy: share((x) => x >= 0.3 && x <= 1.0),
    low: share((x) => x < 0.15),
    apex: mean(apex),
    apexMax: apex.length ? Math.max(...apex) : Number.NaN,
    time: mean(time),
  };
}

export function fmtProfile(s: PassProfile): string {
  const f = (x: number): string => (Number.isNaN(x) ? '  -' : x.toFixed(0).padStart(3));
  return `pass ${s.passLen.toFixed(1)} m | at him p10 ${s.p10.toFixed(2)} median ${s.median.toFixed(2)} p90 ${s.p90.toFixed(2)} m | 0.3-1.0 m ${f(s.comfy)}% <0.15 m ${f(s.low)}% | apex ${s.apex.toFixed(2)} max ${s.apexMax.toFixed(2)} m | ${s.time.toFixed(2)} s to him (${(s.passLen / s.time).toFixed(1)} m/s)`;
}

/** Debug: trace one seed of a case (tick by tick, from the pass). */
export function traceVolley(tuning: Tuning, level: AssistLevel, c: VolleyCase, seed: number): string[] {
  const lines: string[] = [];
  const dry = dryRun(c, level, tuning, seed);
  const rnd = lcg(seed * 104729 + 7);
  const target = c.followCue && dry.cueTick >= 0 ? dry.cueTick : dry.contactTick;
  const release = Math.max(dry.passTick + 2, Math.round(target - c.aimLead / TICK + (normal(rnd) * c.timing) / TICK));
  const hold = c.gesture === 'drag' ? 15 : 6;
  const press = Math.max(dry.passTick + 1, release - hold);
  lines.push(`dry pass ${dry.passTick} contact ${dry.contactTick} cue ${dry.cueTick} outcome ${dry.outcome} | press ${press} release ${release}`);
  const s = setup(c, seed);
  const w = s.w;
  w.assist = level;
  for (let i = 0; i < 120; i++) {
    const cmd = humanCmd(s, c, level, tuning, i, { press, release });
    stepWorld(w, [cmd], tuning);
    if (i < dry.passTick || i > release + 20) continue;
    const p = w.players[w.controlled]!;
    const v = (w as unknown as { volley: { found: boolean; time: number; height: number; contactTick: number; hold: number } }).volley;
    const r = w.players[s.rx]!;
    lines.push(`${i} ctl ${w.controlled} passTo ${w.passTo} owner ${w.ball.owner} ball z ${(w.ball.z - R).toFixed(2)} d ${Math.hypot(w.ball.x - r.x, w.ball.y - r.y).toFixed(2)} | found ${v.found} t ${v.time.toFixed(3)} h ${v.height.toFixed(2)} ct ${v.contactTick} hold ${v.hold} | stick ${cmd.moveX.toFixed(2)},${cmd.moveY.toFixed(2)} shoot ${cmd.shoot ? 'P' : ''}${cmd.shootHeld ? 'H' : ''} since ${p.shotSinceRelease} hold ${p.shotHold.toFixed(2)} | rx ${w.lastReceptionTick === w.tick - 1 ? w.lastReceptionOutcome : '-'} shot ${w.lastShotTick === w.tick - 1 ? (w.lastShot.aerial ? 'AIR ' + w.lastShot.timing.toFixed(3) : 'GROUND') : ''}`);
  }
  return lines;
}

export interface DirectCase {
  /** Receiver to the centre of the goal (m), angle off its axis (deg). */
  dist: number;
  angle: number;
  /** The ball's speed (m/s, horizontal) and its height above the floor (m) when it gets to his blade. */
  speed: number;
  height: number;
  /** Human timing error (sd, s) around the cue; a fixed offset from the cue (s, + = late). */
  timing: number;
  offset?: number;
}

export interface DirectStats {
  n: number;
  /** Is the case possible (the ball starts inside the rink, in front of the goal line)? */
  valid: boolean;
  /** % struck in the air, % with good timing, % on target (all / good timing), in the zone; speed at the goal line; mean contact height. */
  strike: number;
  good: number;
  onTarget: number;
  onGood: number;
  inZone: number;
  speedAtGoal: number;
  height: number;
}

/** Seconds from the start to the ball getting to his blade. */
const DIRECT_TIME = 0.45;

interface DirectSetup {
  w: WorldState;
  wantY: number;
  u: number;
  noise: number;
  valid: boolean;
}

function setupDirect(c: DirectCase, seed: number, tuning: Tuning, level: AssistLevel): DirectSetup {
  const rnd = lcg(seed * 3571 + c.dist * 11 + c.angle * 5 + Math.round(c.speed * 7 + c.height * 100));
  const w = createWorld(seed, 0);
  w.assist = level;
  const p = w.players[0]!;
  const sideY = seed % 2 ? 1 : -1;
  const th = ((c.angle * Math.PI) / 180) * sideY;
  const px = GX - c.dist * Math.cos(th);
  const py = c.dist * Math.sin(th);
  const toGoal = Math.atan2(-py, GX - px);
  // From the front-side: between the goal and his side (a pass back from near the goal line).
  const fromDir = toGoal + sideY * (0.5 + 0.3 * rnd());
  p.x = p.prevX = px;
  p.y = p.prevY = py;
  p.heading = p.prevHeading = fromDir;
  p.vx = p.vy = 0;
  const d = dribbleFor(p, tuning);
  const bladeX = px + Math.cos(fromDir) * d.stickForward + Math.sin(fromDir) * d.stickSide;
  const bladeY = py + Math.sin(fromDir) * d.stickForward - Math.cos(fromDir) * d.stickSide;
  const startD = c.speed * DIRECT_TIME;
  const sx = bladeX + Math.cos(fromDir) * startD;
  const sy = bladeY + Math.sin(fromDir) * startD;
  w.ball.owner = -1;
  w.ball.x = w.ball.prevX = sx;
  w.ball.y = w.ball.prevY = sy;
  w.ball.z = w.ball.prevZ = R + c.height;
  w.ball.vx = -Math.cos(fromDir) * c.speed;
  w.ball.vy = -Math.sin(fromDir) * c.speed;
  w.ball.vz = (9.81 * DIRECT_TIME) / 2;
  w.passTo = 0;
  w.meetX = bladeX;
  w.meetY = bladeY;
  const u = Math.floor(rnd() * 3) - 1;
  const valid = sx < GX - 0.5 && Math.abs(sy) < RINK.width / 2 - 0.5;
  return { w, wantY: u * (RINK.goalWidth / 3), u, noise: (rnd() * 2 - 1) * THUMB_ERROR, valid };
}

function directCmd(s: DirectSetup, level: AssistLevel, tuning: Tuning, i: number, shoot: { press: number; release: number } | null): PlayerCommand {
  const w = s.w;
  const k = shotFor({} as never, tuning);
  const half = RINK.goalWidth / 2 - k.postMargin;
  const range = level === 'strong' ? k.strongAimRange : level === 'light' ? k.lightAimRange : k.mediumAimRange;
  const toCentre = Math.atan2(-w.ball.y, GX - w.ball.x);
  const aim = toCentre + Math.max(-1, Math.min(1, s.wantY / half)) * range + s.noise;
  const aiming = shoot !== null && i >= shoot.press - 3;
  const cmd: PlayerCommand = { ...emptyCommand(), moveX: aiming ? Math.cos(aim) * 0.15 : 0, moveY: aiming ? Math.sin(aim) * 0.15 : 0 };
  if (shoot) {
    cmd.shoot = i === shoot.press;
    cmd.shootHeld = i >= shoot.press && i < shoot.release;
  }
  return cmd;
}

/**
 * A ball delivered straight to a standing receiver's blade (from the front-side, as a pass back
 * from near the goal line would come) at a given speed and height; the human releases TIRO at
 * the TIR cue (taken from the world itself) with his timing error, aiming at a zone. Isolates
 * speed, height and angle.
 */
export function runVolleyDirect(tuning: Tuning, level: AssistLevel, c: DirectCase, n = 200): DirectStats {
  const st: DirectStats = { n, valid: true, strike: 0, good: 0, onTarget: 0, onGood: 0, inZone: 0, speedAtGoal: Number.NaN, height: Number.NaN };
  const speeds: number[] = [];
  const heights: number[] = [];
  let good = 0;
  let goodOn = 0;
  for (let seed = 1; seed <= n; seed++) {
    // The cue: when the TIR button says the ball gets to his stick (a dry run without TIRO).
    const dry = setupDirect(c, seed, tuning, level);
    if (!dry.valid) {
      st.valid = false;
      return st;
    }
    // (The latest prediction before the ball gets there: without TIRO a low ball may be controlled first.)
    let cue = -1;
    for (let i = 0; i < 60 && dry.w.ball.owner < 0; i++) {
      stepWorld(dry.w, [directCmd(dry, level, tuning, i, null)], tuning);
      const v = dry.w.volley;
      if (v.found) cue = i + 1 + Math.round(v.time * 60);
      if (v.found && v.time < 0.5 / 60) break;
    }
    if (cue < 0) continue;
    const rnd = lcg(seed * 7727 + 3);
    const s = setupDirect(c, seed, tuning, level);
    const w = s.w;
    const release = Math.max(2, Math.round(cue + ((c.offset ?? 0) + normal(rnd) * c.timing) * 60));
    const press = Math.max(1, release - 6);
    const startShot = w.lastShotTick;
    let left = -1;
    for (let i = 0; i < 90 && left < 0; i++) {
      stepWorld(w, [directCmd(s, level, tuning, i, { press, release })], tuning);
      if (w.lastShotTick !== startShot) left = i;
    }
    if (left < 0 || !w.lastShot.aerial) continue;
    st.strike++;
    heights.push(w.lastShot.contactHeight);
    const isGood = Math.abs(w.lastShot.timing) <= tuningGood(tuning) + 1e-9;
    if (isGood) good++;
    for (let i = 0; i < 240; i++) {
      const bx = w.ball.x;
      const by = w.ball.y;
      const bz = w.ball.z;
      stepWorld(w, [emptyCommand()], tuning);
      if (w.events.some((e) => e.type === 'post')) break;
      if (bx < GX && w.ball.x >= GX) {
        const f = (GX - bx) / (w.ball.x - bx);
        const y = by + (w.ball.y - by) * f;
        const z = bz + (w.ball.z - bz) * f;
        if (Math.abs(y) <= RINK.goalWidth / 2 - R && z <= RINK.goalHeight - R) {
          st.onTarget++;
          if (isGood) goodOn++;
          speeds.push(Math.hypot(w.ball.vx, w.ball.vy, w.ball.vz));
          const third = RINK.goalWidth / 6;
          const lat = y > third ? 1 : y < -third ? -1 : 0;
          if (lat === s.u) st.inZone++;
        }
        break;
      }
      if (w.ball.owner >= 0 || Math.hypot(w.ball.vx, w.ball.vy) < 0.5) break;
    }
  }
  st.good = st.strike ? (100 * good) / st.strike : Number.NaN;
  st.onGood = good ? (100 * goodOn) / good : Number.NaN;
  st.strike = (100 * st.strike) / n;
  st.onTarget = (100 * st.onTarget) / n;
  st.inZone = (100 * st.inZone) / n;
  st.speedAtGoal = mean(speeds);
  st.height = mean(heights);
  return st;
}

export function fmtDirect(s: DirectStats): string {
  if (!s.valid) return '(fuera de la pista)';
  const f = (x: number): string => (Number.isNaN(x) ? '  -' : x.toFixed(0).padStart(3));
  return `strike ${f(s.strike)}% good ${f(s.good)}% | on target ${f(s.onTarget)}% (good timing ${f(s.onGood)}%) zone ${f(s.inZone)}% | ${Number.isNaN(s.speedAtGoal) ? '-' : s.speedAtGoal.toFixed(1)} m/s | contact ${Number.isNaN(s.height) ? '-' : s.height.toFixed(2)} m`;
}
