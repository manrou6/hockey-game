import { goalLineX, RINK } from '../../../src/config/rink';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { pickUp } from '../../../src/sim/dribble';
import { dribbleFor, shotFor } from '../../../src/sim/feel';
import type { AssistLevel } from '../../../src/sim/pass';
import { createWorld, stepWorld } from '../../../src/sim/world';

// Shooting test bench (F1.5a): a scripted "human" shoots at the empty +x goal from a given
// distance and angle, standing, skating or at a sprint, aiming at one of 6 zones of the goal
// (left / centre / right × low / high) with the stick as option A says, with a thumb error.
// Deterministic (seeded). Run with
//   PATINS_BENCH=1 npx vitest run tests/unit/bench
// Not part of the normal test run (see shotBench.test.ts).

const TICK = 1 / 60;
const GX = goalLineX(1);
const R = RINK.ballRadius;

export type ShotState = 'stand' | 'skate' | 'sprint';
export type ShotType = 'quick' | 'half' | 'sweet' | 'full';

export interface ShotCase {
  /** Distance from the ball to the centre of the goal (m) and angle from the goal axis (deg). */
  dist: number;
  angle: number;
  state: ShotState;
  type: ShotType;
  /** 0 low, 1 high, 2 chip (the diagonal drag). */
  height: number;
}

export interface ShotStats {
  n: number;
  /** % that cross the goal line between the posts and under the bar. */
  onTarget: number;
  /** % that also land in the zone the human aimed at (third of the width × lower / upper half). */
  inZone: number;
  /** % that hit a post or the bar; % that cross the goal line wide of the posts / over the bar. */
  woodwork: number;
  wide: number;
  over: number;
  /** Seconds from pressing TIRO to the ball leaving the stick. */
  release: number;
  /** Ball speed at the goal line (m/s) and flight time to it (s), of those that reach it. */
  speedAtGoal: number;
  flight: number;
  /** Is the case possible (the shooter inside the rink)? */
  valid: boolean;
}

/** Human thumb error on the stick angle (±rad, uniform): the same as the passing bench. */
export const THUMB_ERROR = 0.12;
/** Human touch: a tap lasts this long (s); a half and a full charge are held for these. */
const HOLD: Record<ShotType, number> = { quick: 0.1, half: 0.5, sweet: 0.71, full: 0.85 };
const START_SPEED: Record<ShotState, number> = { stand: 0, skate: 6, sprint: 9 };
const STICK: Record<ShotState, number> = { stand: 0.2, skate: 1, sprint: 1 };

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);

/** Can a shooter stand at this distance and angle inside the rink (1 m from the boards)? */
export function caseValid(c: ShotCase): boolean {
  const th = (c.angle * Math.PI) / 180;
  return c.dist * Math.sin(th) <= RINK.width / 2 - 1.5 && GX - c.dist * Math.cos(th) > -RINK.length / 2 + 2;
}

/** What the shooter looks like at the release (to emulate other error models in the bench). */
export interface ReleaseContext {
  /** Ball to the centre of the goal (m) and angle from the goal axis (deg) at the release. */
  dist: number;
  angle: number;
  /** Player speed (m/s), the charge 0..1 and whether it is a quick shot. */
  speed: number;
  charge: number;
  quick: boolean;
}

export interface ShotOptions {
  /** The shooter's Tir attribute (default 75). */
  shooting?: number;
  /** Called just before the release tick with a private copy of the tuning: may change its numbers (error models). */
  beforeRelease?: (t: Tuning, base: Tuning, ctx: ReleaseContext) => void;
}

export function runShots(tuning: Tuning, level: AssistLevel, c: ShotCase, n = 300, opts: ShotOptions = {}): ShotStats {
  const out: ShotStats = { n, onTarget: 0, inZone: 0, woodwork: 0, wide: 0, over: 0, release: Number.NaN, speedAtGoal: Number.NaN, flight: Number.NaN, valid: caseValid(c) };
  if (!out.valid) return out;
  const k = shotFor({} as never, tuning);
  const half = RINK.goalWidth / 2 - k.postMargin;
  const range = level === 'strong' ? k.strongAimRange : level === 'light' ? k.lightAimRange : k.mediumAimRange;
  let on = 0;
  let zone = 0;
  let wood = 0;
  let wide = 0;
  let over = 0;
  const own = opts.beforeRelease ? structuredClone(tuning) : tuning;
  const releases: number[] = [];
  const speeds: number[] = [];
  const flights: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const rnd = lcg(seed * 7349 + c.dist * 31 + c.angle);
    const t = own;
    const w = createWorld(seed, 0);
    w.assist = level;
    const p = w.players[0]!;
    if (opts.shooting !== undefined) p.shooting = opts.shooting;
    const sideY = seed % 2 ? 1 : -1;
    const th = ((c.angle * Math.PI) / 180) * sideY;
    const bx = GX - c.dist * Math.cos(th);
    const by = c.dist * Math.sin(th);
    const h = Math.atan2(-by, GX - bx);
    const d = dribbleFor(p, t);
    p.heading = p.prevHeading = h;
    p.x = p.prevX = bx - Math.cos(h) * d.stickForward - Math.sin(h) * d.stickSide;
    p.y = p.prevY = by - Math.sin(h) * d.stickForward + Math.cos(h) * d.stickSide;
    p.vx = Math.cos(h) * START_SPEED[c.state];
    p.vy = Math.sin(h) * START_SPEED[c.state];
    w.ball.x = w.ball.prevX = bx;
    w.ball.y = w.ball.prevY = by;
    pickUp(w.ball, 0, p);
    // The zone he wants: a third of the width (centre of it) and the low or high half.
    const u = Math.floor(rnd() * 3) - 1;
    const wantY = u * (RINK.goalWidth / 3);
    const wantHigh = c.height > 0;
    const noise = (rnd() * 2 - 1) * THUMB_ERROR;
    const aim = (): number => {
      const toCentre = Math.atan2(-w.ball.y, GX - w.ball.x);
      // Option A: the angle that maps to that point (assist off: straight at it).
      if (level === 'off') return Math.atan2(wantY - w.ball.y, GX - w.ball.x) + noise;
      return toCentre + Math.max(-1, Math.min(1, wantY / half)) * range + noise;
    };
    const holdTicks = Math.max(1, Math.round(HOLD[c.type] / TICK));
    const press = w.tick;
    const startShot = w.lastShotTick;
    let left = -1;
    for (let i = 0; i < holdTicks + 2 && left < 0; i++) {
      const a = aim();
      const m = STICK[c.state];
      if (opts.beforeRelease && i === holdTicks - 1) {
        const k = tuning.shot;
        const charge = HOLD[c.type] < k.tapTime ? 0 : Math.min(1, Math.max(0, (HOLD[c.type] - k.tapTime) / k.chargeTime));
        opts.beforeRelease(own, tuning, {
          dist: Math.hypot(GX - w.ball.x, w.ball.y),
          angle: (Math.atan2(Math.abs(w.ball.y), GX - w.ball.x) * 180) / Math.PI,
          speed: Math.hypot(p.vx, p.vy),
          charge,
          quick: HOLD[c.type] < k.tapTime,
        });
      }
      const cmd: PlayerCommand = { ...emptyCommand(), moveX: Math.cos(a) * m, moveY: Math.sin(a) * m, sprint: c.state === 'sprint', shoot: i === 0, shootHeld: i < holdTicks - 1, shootHeight: c.height };
      stepWorld(w, [cmd], t);
      if (w.lastShotTick !== startShot) left = w.tick;
    }
    if (left < 0) continue;
    releases.push((left - press) * TICK);
    // Fly to the goal line (or not).
    let crossed = false;
    for (let i = 0; i < 240 && !crossed; i++) {
      const px = w.ball.x;
      const py = w.ball.y;
      const pz = w.ball.z;
      stepWorld(w, [emptyCommand()], t);
      if (w.events.some((e) => e.type === 'post')) {
        wood++;
        break;
      }
      if (px < GX && w.ball.x >= GX) {
        crossed = true;
        const f = (GX - px) / (w.ball.x - px);
        const y = py + (w.ball.y - py) * f;
        const z = pz + (w.ball.z - pz) * f;
        if (Math.abs(y) > RINK.goalWidth / 2 - R) wide++;
        else if (z > RINK.goalHeight - R) over++;
        if (Math.abs(y) <= RINK.goalWidth / 2 - R && z <= RINK.goalHeight - R) {
          on++;
          speeds.push(Math.hypot(w.ball.vx, w.ball.vy, w.ball.vz));
          flights.push((w.tick - left) * TICK);
          const third = RINK.goalWidth / 6;
          const lat = y > third ? 1 : y < -third ? -1 : 0;
          const high = z >= RINK.goalHeight / 2;
          if (lat === u && high === wantHigh) zone++;
        }
      }
      if (w.ball.owner >= 0 || Math.hypot(w.ball.vx, w.ball.vy) < 0.5) break;
    }
  }
  out.onTarget = (100 * on) / n;
  out.inZone = (100 * zone) / n;
  out.woodwork = (100 * wood) / n;
  out.wide = (100 * wide) / n;
  out.over = (100 * over) / n;
  out.release = mean(releases);
  out.speedAtGoal = mean(speeds);
  out.flight = mean(flights);
  return out;
}

export function fmtShots(s: ShotStats): string {
  if (!s.valid) return '   (fuera de la pista)   ';
  return `${s.onTarget.toFixed(0).padStart(3)}% / zone ${s.inZone.toFixed(0).padStart(3)}%`;
}

export const BASE_TUNING = (): Tuning => structuredClone(TUNING);

// --- First-touch shot and turn shot (F1.5b) ---------------------------------------------

export type PassFrom = 'side' | 'behind' | 'front';

export interface FirstTouchStats {
  n: number;
  /** % of receptions that were clean, and % of passes that ended in a shot. */
  clean: number;
  shot: number;
  /** % on target of all passes, and of the shots after a clean reception. */
  onTarget: number;
  onTargetAfterClean: number;
  inZone: number;
  /** Seconds from the ball reaching him to the shot leaving (mean). */
  delay: number;
}

/**
 * A ground pass (launched at passSpeed) comes to a shooter standing `dist` m in front of the goal
 * (angle 0-30°) from the side, from behind him or from the front (a pass back from near the goal
 * line). The human taps TIRO either so it is released ~0.1 s before the ball gets there
 * (`before`: the buffer) or 0.15 s after he gets it (`after`), aiming at a zone (option A) with
 * the thumb error. Assist as given.
 */
export function runFirstTouch(tuning: Tuning, level: AssistLevel, dist: number, angle: number, from: PassFrom, timing: 'before' | 'after', n = 300, passSpeed = 15): FirstTouchStats {
  const k = shotFor({} as never, tuning);
  const half = RINK.goalWidth / 2 - k.postMargin;
  const range = level === 'strong' ? k.strongAimRange : level === 'light' ? k.lightAimRange : k.mediumAimRange;
  let clean = 0;
  let shots = 0;
  let on = 0;
  let onClean = 0;
  let shotsClean = 0;
  let zone = 0;
  const delays: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const rnd = lcg(seed * 4219 + dist * 13 + angle);
    const t = tuning;
    const w = createWorld(seed, 0);
    w.assist = level;
    const p = w.players[0]!;
    const sideY = seed % 2 ? 1 : -1;
    const th = ((angle * Math.PI) / 180) * sideY;
    const px = GX - dist * Math.cos(th);
    const py = dist * Math.sin(th);
    const toGoal = Math.atan2(-py, GX - px);
    // He faces where the pass comes from (as a receiver does), turned a bit towards the goal.
    const passDir = from === 'side' ? toGoal + (Math.PI / 2) * -sideY : from === 'behind' ? toGoal + Math.PI : toGoal + 0.5 * -sideY;
    p.x = p.prevX = px;
    p.y = p.prevY = py;
    p.heading = p.prevHeading = wrap(passDir * 0.75 + toGoal * 0.25);
    p.vx = p.vy = 0;
    // The ball: 8 m away in that direction, rolling to his blade.
    const d = dribbleFor(p, t);
    const bladeX = p.x + Math.cos(p.heading) * d.stickForward + Math.sin(p.heading) * d.stickSide;
    const bladeY = p.y + Math.sin(p.heading) * d.stickForward - Math.cos(p.heading) * d.stickSide;
    const sx = bladeX + Math.cos(passDir) * 8;
    const sy = Math.max(-RINK.width / 2 + 1, Math.min(RINK.width / 2 - 1, bladeY + Math.sin(passDir) * 8));
    const a = Math.atan2(bladeY - sy, bladeX - sx);
    w.ball.owner = -1;
    w.ball.x = w.ball.prevX = sx;
    w.ball.y = w.ball.prevY = sy;
    w.ball.z = w.ball.prevZ = R;
    w.ball.vx = Math.cos(a) * passSpeed;
    w.ball.vy = Math.sin(a) * passSpeed;
    w.ball.vz = 0;
    w.passTo = 0;
    w.meetX = bladeX;
    w.meetY = bladeY;
    const u = Math.floor(rnd() * 3) - 1;
    const wantY = u * (RINK.goalWidth / 3);
    const noise = (rnd() * 2 - 1) * THUMB_ERROR;
    const aimAt = (): number => {
      const bx = w.ball.owner === 0 ? w.ball.x : bladeX;
      const by = w.ball.owner === 0 ? w.ball.y : bladeY;
      const toCentre = Math.atan2(-by, GX - bx);
      if (level === 'off') return Math.atan2(wantY - by, GX - bx) + noise;
      return toCentre + Math.max(-1, Math.min(1, wantY / half)) * range + noise;
    };
    // Estimated arrival (ticks) for the "before" timing: release ~0.1 s before.
    const travel = Math.hypot(bladeX - sx, bladeY - sy);
    const eta = Math.round((travel / (passSpeed * 0.93)) * 60);
    const pressAt = timing === 'before' ? Math.max(0, eta - 6 - 6) : -1;
    let got = -1;
    let pressTick = -1;
    let left = -1;
    const startShot = w.lastShotTick;
    for (let i = 0; i < 150 && left < 0; i++) {
      if (timing === 'after' && got >= 0 && pressTick < 0 && i - got >= 3) pressTick = i;
      if (timing === 'before' && i === pressAt) pressTick = i;
      const hold = pressTick >= 0 ? i - pressTick : -1;
      const aim = aimAt();
      const cmd: PlayerCommand = { ...emptyCommand(), moveX: Math.cos(aim) * 0.15, moveY: Math.sin(aim) * 0.15, shoot: hold === 0, shootHeld: hold >= 0 && hold < 5 };
      stepWorld(w, [cmd], t);
      if (got < 0 && w.lastReceptionPlayer === 0 && w.lastReceptionTick === w.tick - 1) {
        got = i;
        if (w.lastReceptionOutcome === 0) clean++;
        if (w.lastReceptionOutcome > 1) break;
      }
      if (w.lastShotTick !== startShot) left = i;
    }
    if (left < 0) continue;
    shots++;
    const wasClean = w.lastReceptionOutcome === 0;
    if (wasClean) shotsClean++;
    if (got >= 0) delays.push((left - got) / 60);
    let crossed = false;
    for (let i = 0; i < 240 && !crossed; i++) {
      const bx = w.ball.x;
      const by = w.ball.y;
      const bz = w.ball.z;
      stepWorld(w, [emptyCommand()], t);
      if (w.events.some((e) => e.type === 'post')) break;
      if (bx < GX && w.ball.x >= GX) {
        crossed = true;
        const f = (GX - bx) / (w.ball.x - bx);
        const y = by + (w.ball.y - by) * f;
        const z = bz + (w.ball.z - bz) * f;
        if (Math.abs(y) <= RINK.goalWidth / 2 - R && z <= RINK.goalHeight - R) {
          on++;
          if (wasClean) onClean++;
          const third = RINK.goalWidth / 6;
          const lat = y > third ? 1 : y < -third ? -1 : 0;
          if (lat === u) zone++;
        }
      }
      if (w.ball.owner >= 0 || Math.hypot(w.ball.vx, w.ball.vy) < 0.5) break;
    }
  }
  return {
    n,
    clean: (100 * clean) / n,
    shot: (100 * shots) / n,
    onTarget: (100 * on) / n,
    onTargetAfterClean: shotsClean ? (100 * onClean) / shotsClean : Number.NaN,
    inZone: (100 * zone) / n,
    delay: mean(delays),
  };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export interface TurnStats {
  n: number;
  /** % in which the shot was a turn shot. */
  turned: number;
  /** Seconds from pressing TIRO / from releasing it to the ball leaving. */
  fromPress: number;
  fromRelease: number;
  onTarget: number;
}

/**
 * A shooter `dist` m in front of the goal with his back to it, carrying the ball, standing or
 * skating away at 4 m/s; he taps TIRO (0.1 s) with the stick released or pointing at a zone.
 */
export function runTurn(tuning: Tuning, level: AssistLevel, dist: number, state: 'stand' | 'away', stick: 'released' | 'aim', n = 300): TurnStats {
  const k = shotFor({} as never, tuning);
  const half = RINK.goalWidth / 2 - k.postMargin;
  const range = level === 'strong' ? k.strongAimRange : level === 'light' ? k.lightAimRange : k.mediumAimRange;
  let turned = 0;
  let on = 0;
  const fromPress: number[] = [];
  const fromRelease: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const rnd = lcg(seed * 911 + dist * 7);
    const t = tuning;
    const w = createWorld(seed, 0);
    w.assist = level;
    const p = w.players[0]!;
    const by = (rnd() * 2 - 1) * 1.5;
    const bx = GX - dist;
    const h = Math.PI + (rnd() * 2 - 1) * 0.4; // back to the goal
    const d = dribbleFor(p, t);
    p.heading = p.prevHeading = h;
    p.x = p.prevX = bx - Math.cos(h) * d.stickForward - Math.sin(h) * d.stickSide;
    p.y = p.prevY = by - Math.sin(h) * d.stickForward + Math.cos(h) * d.stickSide;
    const v = state === 'away' ? 4 : 0;
    p.vx = Math.cos(h) * v;
    p.vy = Math.sin(h) * v;
    w.ball.x = w.ball.prevX = bx;
    w.ball.y = w.ball.prevY = by;
    pickUp(w.ball, 0, p);
    const u = Math.floor(rnd() * 3) - 1;
    const wantY = u * (RINK.goalWidth / 3);
    const noise = (rnd() * 2 - 1) * THUMB_ERROR;
    const startShot = w.lastShotTick;
    const startTurn = w.lastTurnTick;
    let left = -1;
    for (let i = 0; i < 60 && left < 0; i++) {
      // Skating away with the stick released = gliding (the human lets go of the stick to turn and shoot).
      let mx = state === 'away' && stick === 'aim' ? Math.cos(h) : 0;
      let my = state === 'away' && stick === 'aim' ? Math.sin(h) : 0;
      if (stick === 'aim') {
        const toCentre = Math.atan2(-w.ball.y, GX - w.ball.x);
        const a = toCentre + Math.max(-1, Math.min(1, wantY / half)) * range + noise;
        mx = Math.cos(a) * 0.15;
        my = Math.sin(a) * 0.15;
      }
      const cmd: PlayerCommand = { ...emptyCommand(), moveX: mx, moveY: my, shoot: i === 0, shootHeld: i < 5 };
      stepWorld(w, [cmd], t);
      if (w.lastShotTick !== startShot) left = i;
    }
    if (left < 0) continue;
    if (w.lastTurnTick !== startTurn) turned++;
    fromPress.push((left + 1) / 60);
    fromRelease.push((left - 5) / 60);
    for (let i = 0; i < 240; i++) {
      const px = w.ball.x;
      const py = w.ball.y;
      const pz = w.ball.z;
      stepWorld(w, [emptyCommand()], t);
      if (w.events.some((e) => e.type === 'post')) break;
      if (px < GX && w.ball.x >= GX) {
        const f = (GX - px) / (w.ball.x - px);
        const y = py + (w.ball.y - py) * f;
        const z = pz + (w.ball.z - pz) * f;
        if (Math.abs(y) <= RINK.goalWidth / 2 - R && z <= RINK.goalHeight - R) on++;
        break;
      }
      if (w.ball.owner >= 0 || Math.hypot(w.ball.vx, w.ball.vy) < 0.5) break;
    }
  }
  return { n, turned: (100 * turned) / n, fromPress: mean(fromPress), fromRelease: mean(fromRelease), onTarget: (100 * on) / n };
}
