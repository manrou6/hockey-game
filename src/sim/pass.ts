import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { GRAVITY, type BallState } from './ball';
import type { PlayerCommand } from './commands';
import { pressureOn, releaseBall } from './dribble';
import { dribbleFor, passFor, receiveFor, skatingFor, wallFor } from './feel';
import { isCutting, isSkidding, wrapAngle, type PlayerState } from './player';
import { nextFloat, type RngState } from './rng';
import { BISECT_STEPS, roll, SOLVER_DT, SOLVER_MAX_TIME, type RollResult } from './rolling';
import { createWallPlan, planWallPass } from './wallPass';

// The pass (docs/03 §3). PASE tap = ground pass, hold = driven lofted pass ("alt fort"), hold
// longer = lob ("vaselina"); it leaves when the button is released (or, within the input
// buffer, as soon as the player gets the ball). The receiver is the teammate closest to the
// aimed direction inside the assist cone, chosen when PASE is pressed; the direction is
// corrected towards where his stick will be, and the strength is worked out so the ball gets
// there nicely (ground: arrives at a controllable speed; driven: a low, strong ballistic flight
// that lands just before him; lob: a high arc that lands just before him). Everything is
// decided at the release: after that only physics (gravity, bounce, rolling) moves the ball.
// A small deterministic error depends on the situation and the Pase attribute.

/** Kinds of pass (PlayerState.passKind, WorldState.passKind). */
export const PASS_GROUND = 0;
export const PASS_DRIVE = 1;
export const PASS_LOB = 2;
export type PassKind = typeof PASS_GROUND | typeof PASS_DRIVE | typeof PASS_LOB;

/** Kind of pass from the height chosen in the command (0 low, 1 driven lofted, 2 lob). */
export function passKindFromHeight(height: number): PassKind {
  return height >= 2 ? PASS_LOB : height >= 1 ? PASS_DRIVE : PASS_GROUND;
}

/** Power 0..1 of a PASE held for `hold` seconds (a tap = 0: automatic power). */
export function passPower(hold: number, k: Tuning['pass']): number {
  return Math.min(1, Math.max(0, (hold - k.tapTime) / Math.max(0.05, k.powerChargeTime)));
}

/** Pass assist levels (Settings). Ids are persisted: never rename, only add. */
export const ASSIST_LEVELS = ['off', 'light', 'medium', 'strong'] as const;
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
  out.cone = level === 'strong' ? a.strongCone : level === 'medium' ? a.mediumCone : level === 'light' ? a.lightCone : 0;
  out.correction = level === 'strong' ? a.strongCorrection : level === 'medium' ? a.mediumCorrection : level === 'light' ? a.lightCorrection : 0;
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
 * with its kind (the height chosen in the command) and power (by how long it was held). A
 * press and release within one tick is a tap. Returns 'pressed' on the press tick (the
 * caller locks the receiver then).
 */
export function updatePassButton(p: PlayerState, cmd: PlayerCommand, tuning: Tuning, dt: number): 'pressed' | null {
  const k = passFor(p, tuning);
  let pressed: 'pressed' | null = null;
  if (cmd.pass && p.passHold < 0) {
    p.passHold = 0;
    pressed = 'pressed';
  } else if (p.passHold >= 0) p.passHold += dt;
  if (p.passHold >= 0 && !cmd.passHeld) {
    p.passKind = passKindFromHeight(cmd.passHeight);
    p.passCharge = passPower(p.passHold, k);
    p.passHold = -1;
    p.bufPass = Math.max(1, Math.round(tuning.input.bufferTime * tuning.sim.tickRate));
  }
  return pressed;
}

/**
 * Lock the receiver when PASE is pressed (what the ring shows is what you get, even if the
 * stick moves while charging a lofted pass), and how far off him the stick was aimed.
 */
export function lockPassTarget(players: readonly PlayerState[], from: number, aim: number, cone: number): void {
  const p = players[from]!;
  const target = choosePassTarget(players, from, aim, cone);
  p.passLockTarget = target;
  if (target >= 0) {
    const r = players[target]!;
    p.passLockOffset = wrapAngle(aim - Math.atan2(r.y - p.y, r.x - p.x));
  } else p.passLockOffset = 0;
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

const rollTmp: RollResult = { speed: 0, time: 0 };

/** Arrival speed a ground pass aims for at `dist` m: gentler when the receiver is close. */
export function groundArrivalFor(dist: number, k: Tuning['pass']): number {
  const u = Math.min(1, Math.max(0, (dist - k.groundShortFrom) / Math.max(0.1, k.groundShortTo - k.groundShortFrom)));
  return k.groundShortArrivalSpeed + (k.groundArrivalSpeed - k.groundShortArrivalSpeed) * u;
}

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
  // loft = any lofted pass (driven or lob).
  const k = passFor(p, tuning);
  const sk = skatingFor(p, tuning);
  const speed = Math.hypot(p.vx, p.vy);
  const sprint = Math.min(1, Math.max(0, (speed - sk.maxSpeed) / Math.max(0.1, sk.sprintSpeed - sk.maxSpeed)));
  const offBalance = isSkidding(p) || isCutting(p) ? 1 : 0;
  const raw = k.errorBase + k.errorSprint * sprint + k.errorPressure * pressureOn(p, players, tuning) + k.errorOffBalance * offBalance;
  const skill = Math.min(1, Math.max(0, p.passing / 99));
  return raw * (loft ? k.errorLoft : 1) * (1 - k.attributeAdvantage * skill);
}

/** Error multiplier of a pass right after receiving (first touch, F1.4c); 1 otherwise. */
export function firstTouchFactor(p: PlayerState, tuning: Tuning): number {
  if (p.firstTouchTicks <= 0) return 1;
  return receiveFor(p, tuning).firstTouchError * (1 + Math.max(0, p.receiveDifficulty));
}

export interface PassResult {
  /** Receiver chosen by the assist (−1 = pass into space). */
  target: number;
  kind: PassKind;
  /** Where the pass was aimed to meet the receiver's stick (NaN = into space). */
  meetX: number;
  meetY: number;
  /** A wall pass (F1.4d): against a side board, back to the passer. wallX/Y = where it hits. */
  wall: boolean;
  wallX: number;
  wallY: number;
}

/** A pass worked out before the human error: what the arrow shows and what gets launched. */
export interface PassPlan extends PassResult {
  /** Horizontal direction (rad), launch speed (m/s) and launch elevation (rad, 0 = ground). */
  angle: number;
  speed: number;
  elevation: number;
}

export function createPassPlan(): PassPlan {
  return { target: -1, kind: PASS_GROUND, meetX: Number.NaN, meetY: Number.NaN, wall: false, wallX: Number.NaN, wallY: Number.NaN, angle: 0, speed: 0, elevation: 0 };
}

const assistTmp: AssistParams = { cone: 0, correction: 0 };

/**
 * Launch of a driven lofted pass landing `dist` m away: the elevation that peaks at about
 * driveMaxHeight (never steeper than driveLaunchAngle) and the speed for it (≤ driveMaxSpeed).
 */
/** Steepest a driven pass is ever hit when it must reach far (rad, ~ the longest range with drag). */
const DRIVE_MAX_ELEVATION = 0.7;

function drivenLaunch(dist: number, k: Tuning['pass'], kb: Tuning['ball'], out: PassPlan): void {
  // Without drag a ballistic arc over d peaks at d·tan(θ)/4.
  out.elevation = Math.min(k.driveLaunchAngle, Math.atan((4 * k.driveMaxHeight) / Math.max(0.5, dist)));
  if (flight(k.driveMaxSpeed, out.elevation, kb, flightTmp).dist >= dist) {
    out.speed = loftPassSpeed(dist, out.elevation, k.driveMaxSpeed, kb);
    return;
  }
  // Too far for that flat a pass at the maximum speed: hit it at full strength and raise the
  // angle just enough to get there (it flies a bit higher), so a long pass never falls short.
  let lo = out.elevation;
  let hi = DRIVE_MAX_ELEVATION;
  if (flight(k.driveMaxSpeed, hi, kb, flightTmp).dist < dist) lo = hi; // out of range: furthest
  else {
    for (let i = 0; i < BISECT_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (flight(k.driveMaxSpeed, mid, kb, flightTmp).dist < dist) lo = mid;
      else hi = mid;
    }
    lo = hi;
  }
  out.elevation = lo;
  out.speed = k.driveMaxSpeed;
}

/**
 * A faster lofted launch to the same distance: at `speed`, the lowest elevation (between almost
 * flat and the current one) that still lands `dist` metres away. Keeps `out` if it can't.
 */
function flatterLaunch(dist: number, speed: number, kb: Tuning['ball'], out: PassPlan): void {
  if (speed <= out.speed + 1e-6) return;
  let lo = 0.01;
  let hi = out.elevation;
  if (flight(speed, lo, kb, flightTmp).dist >= dist) {
    // Even almost flat it goes too far at that speed: keep it a lofted pass at its old angle.
    return;
  }
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (flight(speed, mid, kb, flightTmp).dist < dist) lo = mid;
    else hi = mid;
  }
  out.elevation = hi;
  out.speed = speed;
}

/**
 * Work out the pass of player `from` (kind and power 0..1 given) towards the stick direction in
 * `cmd`, with the receiver locked at the press (lockTarget −2 = choose now). No human error,
 * nothing changes: used for the launch and for the arrow while PASE is held.
 */
export function planPass(
  players: readonly PlayerState[],
  ball: BallState,
  from: number,
  cmd: PlayerCommand,
  level: AssistLevel,
  kind: PassKind,
  charge: number,
  lockTarget: number,
  lockOffset: number,
  tuning: Tuning,
  out: PassPlan,
): PassPlan {
  const p = players[from]!;
  const k = passFor(p, tuning);
  const kb = tuning.ball;
  const assist = assistParams(level, tuning, assistTmp);
  let target: number;
  let aimOffset: number;
  if (lockTarget > -2 && (lockTarget < 0 || players[lockTarget])) {
    target = lockTarget;
    aimOffset = lockOffset;
  } else {
    const aim0 = aimAngle(p, cmd);
    target = choosePassTarget(players, from, aim0, assist.cone);
    const r0 = players[target];
    aimOffset = r0 ? wrapAngle(aim0 - Math.atan2(r0.y - p.y, r0.x - p.x)) : 0;
  }
  const aim = aimAngle(p, cmd);
  out.target = target;
  out.kind = kind;
  out.angle = aim;
  out.elevation = 0;
  out.speed = k.groundNoTargetSpeed;
  out.meetX = out.meetY = Number.NaN;
  out.wall = false;
  out.wallX = out.wallY = Number.NaN;
  if (target >= 0) {
    const r = players[target]!;
    const d = dribbleFor(r, tuning);
    // Aim where his blade will be once he faces the ball (to the right of his body), leading
    // his movement by the travel time (a few refinements are plenty).
    let t = 0;
    let to = aim;
    for (let it = 0; it < 3; it++) {
      const fx = r.x + r.vx * t * k.lead;
      const fy = r.y + r.vy * t * k.lead;
      const face = Math.atan2(ball.y - fy, ball.x - fx);
      const tx = fx + Math.sin(face) * d.stickSide + Math.cos(face) * d.stickForward;
      const ty = fy - Math.cos(face) * d.stickSide + Math.sin(face) * d.stickForward;
      out.meetX = tx;
      out.meetY = ty;
      const dist = Math.max(0.5, Math.hypot(tx - ball.x, ty - ball.y));
      to = Math.atan2(ty - ball.y, tx - ball.x);
      if (kind === PASS_GROUND) {
        // Automatic strength, plus the charged power on top (up to the maximum).
        const auto = groundPassSpeed(dist, groundArrivalFor(dist, k) + (level === 'medium' ? tuning.assist.mediumArrivalBonus : 0), k.groundMinSpeed, k.groundMaxSpeed, kb);
        out.speed = auto + (Math.max(auto, k.groundMaxSpeed) - auto) * charge;
        const tt = groundPassTime(out.speed, dist, kb);
        t = Number.isFinite(tt) ? tt : dist / out.speed;
      } else {
        // Lands a little before him and bounces/rolls the rest of the way.
        const land = Math.max(1, dist - (kind === PASS_DRIVE ? k.driveLandShort : k.loftLandShort));
        if (kind === PASS_DRIVE) {
          drivenLaunch(land, k, kb, out);
          // Charged: faster and flatter to the same landing point.
          if (charge > 0) flatterLaunch(land, out.speed + (Math.max(out.speed, k.driveChargeMaxSpeed) - out.speed) * charge, kb, out);
        } else {
          out.elevation = k.loftAngle;
          out.speed = loftPassSpeed(land, k.loftAngle, k.loftMaxSpeed, kb);
        }
        const vh = Math.max(1, out.speed * Math.cos(out.elevation));
        t = loftFlightTime(out.speed, out.elevation, kb) + (dist - land) / vh;
      }
    }
    // The player aims at where he SEES the teammate; leading him is the assist's job. So the
    // aiming error is measured against the teammate's direction and only (1 − correction) of
    // it is kept, on top of the led direction.
    out.angle = to + (1 - assist.correction) * aimOffset;
  } else if (kind === PASS_LOB) {
    out.elevation = k.loftAngle;
    out.speed = loftPassSpeed(k.loftMinDistance + (k.loftMaxDistance - k.loftMinDistance) * charge, k.loftAngle, k.loftMaxSpeed, kb);
  } else if (kind === PASS_DRIVE) {
    drivenLaunch(k.driveNoTargetDistance + (k.driveNoTargetMaxDistance - k.driveNoTargetDistance) * charge, k, kb, out);
  } else {
    out.speed = k.groundNoTargetSpeed + (Math.max(k.groundNoTargetSpeed, k.groundMaxSpeed) - k.groundNoTargetSpeed) * charge;
    // Nobody in the cone and aiming at a side board: the assist may make it a wall pass (F1.4d).
    const w = wallFor(p, tuning);
    const cone = level === 'strong' ? w.strongCone : level === 'medium' ? w.mediumCone : level === 'light' ? w.lightCone : 0;
    if (planWallPass(p, ball, aim, cmd.sprint, cone, Math.max(assist.correction, w.minCorrection), k.groundMinSpeed, k.groundMaxSpeed, tuning, wallTmp)) {
      out.wall = true;
      out.angle = wallTmp.angle;
      out.speed = wallTmp.speed;
      out.wallX = wallTmp.wallX;
      out.wallY = wallTmp.wallY;
      out.meetX = wallTmp.meetX;
      out.meetY = wallTmp.meetY;
    }
  }
  return out;
}

const planTmp: PassPlan = createPassPlan();
const wallTmp = createWallPlan();

/**
 * Player `from` passes the ball he is carrying, using the kind/charge queued by the button,
 * the receiver locked at the press and the stick direction in `cmd`. Returns who it is for.
 * The assist acts only here, at the release: then the ball is on its own.
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
  const plan = planPass(players, ball, from, cmd, level, p.passKind as PassKind, p.passCharge, p.passLockTarget, p.passLockOffset, tuning, planTmp);
  p.passLockTarget = -2;
  // Human touch: a small direction and strength error (deterministic).
  // First touch (F1.4c): right after receiving it is less exact, more after a hard reception.
  // A wall pass is planned (the assist worked out the bounce): smaller errors (F1.4d).
  const touch = firstTouchFactor(p, tuning) * (plan.wall ? wallFor(p, tuning).errorFactor : 1);
  const angle = plan.angle + gaussian(rng) * passErrorSd(p, players, plan.kind !== PASS_GROUND, tuning) * touch;
  // A lofted pass's distance grows with the square of its speed: halve its strength error so
  // its distance error matches a ground pass's (long passes don't randomly fall short).
  const powerSd = (plan.kind === PASS_GROUND ? k.errorPower : k.errorPower / 2) * touch;
  const speed = plan.speed * Math.max(0.5, 1 + gaussian(rng) * powerSd);

  releaseBall(ball, p, tuning);
  // From the floor: ground passes roll, lofted ones rise from the stick.
  const h = speed * Math.cos(plan.elevation);
  ball.vx = Math.cos(angle) * h;
  ball.vy = Math.sin(angle) * h;
  ball.vz = speed * Math.sin(plan.elevation);
  ball.z = RINK.ballRadius;
  p.bufPass = 0;
  out.target = plan.target;
  out.kind = plan.kind;
  out.meetX = plan.meetX;
  out.meetY = plan.meetY;
  out.wall = plan.wall;
  out.wallX = plan.wallX;
  out.wallY = plan.wallY;
  return out;
}
