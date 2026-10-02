import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { GRAVITY, type BallState } from './ball';
import type { PlayerCommand } from './commands';
import { pressureOn, releaseBall } from './dribble';
import { dribbleFor, passFor, skatingFor } from './feel';
import { isCutting, isSkidding, wrapAngle, type PlayerState } from './player';
import { nextFloat, type RngState } from './rng';

// The pass (docs/03 §3, F1.4b). PASE tap = ground pass, hold = lofted pass; it leaves when
// the button is released (or, within the input buffer, as soon as the player gets the ball).
// The receiver is the teammate closest to the aimed direction inside the assist cone; the
// direction is corrected towards where his stick will be, and the strength is worked out so
// the ball gets there nicely (ground: arrives at a controllable speed; lofted: lands just
// before him). A small deterministic error depends on the situation and the Pase attribute.

/** Pass assist levels (Settings). Ids are persisted: never rename, only add. */
export const ASSIST_LEVELS = ['off', 'light', 'strong'] as const;
export type AssistLevel = (typeof ASSIST_LEVELS)[number];

export function isAssistLevel(v: unknown): v is AssistLevel {
  return typeof v === 'string' && (ASSIST_LEVELS as readonly string[]).includes(v);
}

export interface AssistParams {
  /** Half-angle of the cone where a teammate can be chosen (rad); 0 = no receiver choice. */
  cone: number;
  /** How much the direction is corrected towards the receiver (0..1). */
  correction: number;
}

export function assistParams(level: AssistLevel, tuning: Tuning, out: AssistParams): AssistParams {
  const a = tuning.assist;
  out.cone = level === 'strong' ? a.strongCone : level === 'light' ? a.lightCone : 0;
  out.correction = level === 'strong' ? a.strongCorrection : level === 'light' ? a.lightCorrection : 0;
  return out;
}

/** Below this stick magnitude the pass goes the way the player faces. */
const AIM_MIN_STICK = 0.05;

/** Direction the player is aiming a pass: the stick, or where he faces if it's released. */
export function aimAngle(p: PlayerState, cmd: PlayerCommand): number {
  return Math.hypot(cmd.moveX, cmd.moveY) >= AIM_MIN_STICK ? Math.atan2(cmd.moveY, cmd.moveX) : p.heading;
}

/**
 * PASE button: a press starts the charge, the release queues the pass in the input buffer
 * (lofted if it was held at least tapTime). A press and release within one tick is a tap.
 */
export function updatePassButton(p: PlayerState, cmd: PlayerCommand, tuning: Tuning, dt: number): void {
  const k = passFor(p, tuning);
  if (cmd.pass && p.passHold < 0) p.passHold = 0;
  else if (p.passHold >= 0) p.passHold += dt;
  if (p.passHold >= 0 && !cmd.passHeld) {
    p.passLoft = p.passHold >= k.tapTime - 1e-9;
    p.passCharge = Math.min(1, Math.max(0, (p.passHold - k.tapTime) / Math.max(0.05, k.loftChargeTime)));
    p.passHold = -1;
    p.bufPass = Math.max(1, Math.round(tuning.input.bufferTime * tuning.sim.tickRate));
  }
}

/** Score cost per metre of distance when choosing between teammates (rad/m): at equal angle, the nearer one. */
const DISTANCE_COST = 0.01;

/**
 * The teammate a pass aimed at `aim` goes to: the one closest to that direction inside the
 * cone (slightly preferring nearer ones), or −1.
 */
export function choosePassTarget(players: readonly PlayerState[], from: number, aim: number, cone: number): number {
  if (cone <= 0) return -1;
  const p = players[from]!;
  let best = -1;
  let bestScore = Infinity;
  for (let j = 0; j < players.length; j++) {
    const o = players[j]!;
    if (j === from || o.team !== p.team) continue;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) continue;
    const off = Math.abs(wrapAngle(Math.atan2(dy, dx) - aim));
    if (off > cone) continue;
    const score = off + dist * DISTANCE_COST;
    if (score < bestScore) {
      best = j;
      bestScore = score;
    }
  }
  return best;
}

// --- Strength solvers (same force model as the ball physics, integrated per tick) ---------

const SOLVER_DT = 1 / 120;
const SOLVER_MAX_TIME = 6;
const BISECT_STEPS = 28;

interface RollResult {
  /** Speed when it has rolled `dist` metres (0 if it stops before). */
  speed: number;
  time: number;
}

/** Roll a ball on the floor from speed v0 for `dist` metres. */
function roll(v0: number, dist: number, k: Tuning['ball'], out: RollResult): RollResult {
  let v = v0;
  let x = 0;
  let t = 0;
  while (x < dist && t < SOLVER_MAX_TIME) {
    v = Math.max(0, v - (k.rollingDecel + k.rollingDrag * v) * SOLVER_DT);
    v *= Math.max(0, 1 - k.airDrag * v * SOLVER_DT);
    if (v <= 0) {
      out.speed = 0;
      out.time = Infinity;
      return out;
    }
    x += v * SOLVER_DT;
    t += SOLVER_DT;
  }
  out.speed = x >= dist ? v : 0;
  out.time = x >= dist ? t : Infinity;
  return out;
}

const rollTmp: RollResult = { speed: 0, time: 0 };

/** Ground pass launch speed that reaches `dist` at `arrival` m/s (clamped to [min, max]). */
export function groundPassSpeed(dist: number, arrival: number, min: number, max: number, k: Tuning['ball']): number {
  let lo = min;
  let hi = max;
  if (roll(lo, dist, k, rollTmp).speed >= arrival) return lo;
  if (roll(hi, dist, k, rollTmp).speed <= arrival) return hi;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (roll(mid, dist, k, rollTmp).speed < arrival) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Time (s) for a ground pass launched at v0 to cover `dist` (Infinity if it stops before). */
export function groundPassTime(v0: number, dist: number, k: Tuning['ball']): number {
  return roll(v0, dist, k, rollTmp).time;
}

interface FlightResult {
  dist: number;
  time: number;
}

/** Flight of a ball launched at speed v and angle `angle` until it lands again. */
function flight(v: number, angle: number, k: Tuning['ball'], out: FlightResult): FlightResult {
  let vh = v * Math.cos(angle);
  let vz = v * Math.sin(angle);
  let x = 0;
  let z = 0;
  let t = 0;
  while (t < SOLVER_MAX_TIME) {
    vz -= GRAVITY * SOLVER_DT;
    const s = Math.max(0, 1 - k.airDrag * Math.hypot(vh, vz) * SOLVER_DT);
    vh *= s;
    vz *= s;
    x += vh * SOLVER_DT;
    z += vz * SOLVER_DT;
    t += SOLVER_DT;
    if (z <= 0 && vz < 0) break;
  }
  out.dist = x;
  out.time = t;
  return out;
}

const flightTmp: FlightResult = { dist: 0, time: 0 };

/** Launch speed of a lofted pass at `angle` that lands `dist` metres away (≤ maxSpeed). */
export function loftPassSpeed(dist: number, angle: number, maxSpeed: number, k: Tuning['ball']): number {
  let lo = 1;
  let hi = maxSpeed;
  if (flight(hi, angle, k, flightTmp).dist <= dist) return hi;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (flight(mid, angle, k, flightTmp).dist < dist) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Flight time (s) of a lofted pass. */
export function loftFlightTime(v: number, angle: number, k: Tuning['ball']): number {
  return flight(v, angle, k, flightTmp).time;
}

/** Approximately normal deviate (mean 0, sd 1) from four uniforms: deterministic and cheap. */
function gaussian(rng: RngState): number {
  return (nextFloat(rng) + nextFloat(rng) + nextFloat(rng) + nextFloat(rng) - 2) * Math.sqrt(3);
}

/** Direction error (rad, one standard deviation) of a pass by this player right now. */
export function passErrorSd(p: PlayerState, players: readonly PlayerState[], loft: boolean, tuning: Tuning): number {
  const k = passFor(p, tuning);
  const sk = skatingFor(p, tuning);
  const speed = Math.hypot(p.vx, p.vy);
  const sprint = Math.min(1, Math.max(0, (speed - sk.maxSpeed) / Math.max(0.1, sk.sprintSpeed - sk.maxSpeed)));
  const offBalance = isSkidding(p) || isCutting(p) ? 1 : 0;
  const raw = k.errorBase + k.errorSprint * sprint + k.errorPressure * pressureOn(p, players, tuning) + k.errorOffBalance * offBalance;
  const skill = Math.min(1, Math.max(0, p.passing / 99));
  return raw * (loft ? k.errorLoft : 1) * (1 - k.attributeAdvantage * skill);
}

export interface PassResult {
  /** Receiver chosen by the assist (−1 = pass into space). */
  target: number;
  loft: boolean;
}

const assistTmp: AssistParams = { cone: 0, correction: 0 };

/**
 * Player `from` passes the ball he is carrying, using the kind/charge queued by the button
 * and the stick direction in `cmd`. Returns who it is for.
 */
export function performPass(
  players: readonly PlayerState[],
  ball: BallState,
  from: number,
  cmd: PlayerCommand,
  level: AssistLevel,
  rng: RngState,
  tuning: Tuning,
  out: PassResult,
): PassResult {
  const p = players[from]!;
  const k = passFor(p, tuning);
  const kb = tuning.ball;
  const loft = p.passLoft;
  const assist = assistParams(level, tuning, assistTmp);
  const aim = aimAngle(p, cmd);
  const target = choosePassTarget(players, from, aim, assist.cone);

  let angle = aim;
  let speed: number;
  if (target >= 0) {
    const r = players[target]!;
    const d = dribbleFor(r, tuning);
    // Aim where his blade will be once he faces the ball (to the right of his body), leading
    // his movement by the travel time (two refinements are plenty).
    let t = 0;
    let dist = 0;
    let to = aim;
    speed = k.groundNoTargetSpeed;
    for (let it = 0; it < 3; it++) {
      const fx = r.x + r.vx * t * k.lead;
      const fy = r.y + r.vy * t * k.lead;
      const face = Math.atan2(ball.y - fy, ball.x - fx);
      const tx = fx + Math.sin(face) * d.stickSide + Math.cos(face) * d.stickForward;
      const ty = fy - Math.cos(face) * d.stickSide + Math.sin(face) * d.stickForward;
      dist = Math.max(0.5, Math.hypot(tx - ball.x, ty - ball.y));
      to = Math.atan2(ty - ball.y, tx - ball.x);
      if (loft) {
        const land = Math.max(1, dist - k.loftLandShort);
        speed = loftPassSpeed(land, k.loftAngle, k.loftMaxSpeed, kb);
        const vh = Math.max(1, speed * Math.cos(k.loftAngle));
        t = loftFlightTime(speed, k.loftAngle, kb) + (dist - land) / vh;
      } else {
        speed = groundPassSpeed(dist, k.groundArrivalSpeed, k.groundMinSpeed, k.groundMaxSpeed, kb);
        const tt = groundPassTime(speed, dist, kb);
        t = Number.isFinite(tt) ? tt : dist / speed;
      }
    }
    angle = aim + assist.correction * wrapAngle(to - aim);
  } else if (loft) {
    const dist = k.loftMinDistance + (k.loftMaxDistance - k.loftMinDistance) * p.passCharge;
    speed = loftPassSpeed(dist, k.loftAngle, k.loftMaxSpeed, kb);
  } else {
    speed = k.groundNoTargetSpeed;
  }

  // Human touch: a small direction and strength error (deterministic).
  angle += gaussian(rng) * passErrorSd(p, players, loft, tuning);
  speed *= Math.max(0.5, 1 + gaussian(rng) * k.errorPower);

  releaseBall(ball, p, tuning);
  const h = loft ? speed * Math.cos(k.loftAngle) : speed;
  ball.vx = Math.cos(angle) * h;
  ball.vy = Math.sin(angle) * h;
  ball.vz = loft ? speed * Math.sin(k.loftAngle) : 0;
  ball.z = RINK.ballRadius;
  p.bufPass = 0;
  out.target = target;
  out.loft = loft;
  return out;
}
