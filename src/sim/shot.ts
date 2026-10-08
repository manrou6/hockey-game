import { goalLineX, RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { GRAVITY, type BallState } from './ball';
import type { PlayerCommand } from './commands';
import { releaseBall } from './dribble';
import { dribbleFor, shotFor, skatingFor } from './feel';
import { gaussian, loftPassSpeed, type AssistLevel } from './pass';
import { isCutting, isSkidding, wrapAngle, type PlayerState } from './player';
import type { RngState } from './rng';
import { SOLVER_DT, SOLVER_MAX_TIME } from './rolling';

// The shot (F1.5a-b, docs/03 §3 TIRO). A tap of TIRO is a quick shot; holding it charges a drag
// shot (the ball glued to the blade, the player a bit slower) whose power and precision grow
// until it is released. The height comes from the same diagonal drag as PASE (low / high /
// chip). Where it goes (option A): the angle of the stick from the direction to the centre of
// the goal, magnified so that a small angle already reaches a post; the stick released = the
// far post. F1.5b: TIRO just before getting the ball (or right after) = first-touch shot;
// near the goal with the back to it, a quick turn first (media vuelta). Everything is decided
// at the release; then the ball is plain physics.

export const SHOT_LOW = 0;
export const SHOT_HIGH = 1;
export const SHOT_CHIP = 2;
export type ShotKind = typeof SHOT_LOW | typeof SHOT_HIGH | typeof SHOT_CHIP;

/** Kind of shot from the height chosen in the command (0 low, 1 high, 2 chip). */
export function shotKindFromHeight(height: number): ShotKind {
  return height >= 2 ? SHOT_CHIP : height >= 1 ? SHOT_HIGH : SHOT_LOW;
}

/** Power 0..1 of a TIRO held for `hold` seconds (a tap = 0). */
export function shotPower(hold: number, k: Tuning['shot']): number {
  return Math.min(1, Math.max(0, (hold - k.tapTime) / Math.max(0.05, k.chargeTime)));
}

/** The goal a player attacks: team 0 the +x one. */
export function attackedSide(p: PlayerState): -1 | 1 {
  return p.team === 0 ? 1 : -1;
}

/** Distance (m) from the ball to the centre of the goal player `p` attacks. */
export function goalDistance(p: PlayerState, ball: BallState): number {
  return Math.hypot(goalLineX(attackedSide(p)) - ball.x, ball.y);
}

/**
 * TIRO button: the press starts the charge, the release queues the shot (bufShoot) with its
 * kind, whether it was a tap and its power. Carrying the ball it leaves at once; without the
 * ball it waits in the input buffer and leaves as a first-touch shot if he gets the ball in
 * time (F1.5b). Pressed with the ball, losing it while charging cancels it. Not while PASE is
 * held or during a turn shot.
 */
export function updateShotButton(p: PlayerState, cmd: PlayerCommand, tuning: Tuning, dt: number, hasBall: boolean): void {
  const k = shotFor(p, tuning);
  if (cmd.shoot && p.shotHold < 0 && p.passHold < 0 && p.shotTurn <= 0) {
    p.shotHold = 0;
    p.shotWithBall = hasBall;
  } else if (p.shotHold >= 0) p.shotHold += dt;
  if (p.shotHold < 0) return;
  if (hasBall) p.shotWithBall = true;
  else if (p.shotWithBall) {
    p.shotHold = -1;
    return;
  }
  if (!cmd.shootHeld) {
    p.shotKind = shotKindFromHeight(cmd.shootHeight);
    p.shotQuick = p.shotHold < k.tapTime;
    p.shotCharge = p.shotQuick ? 0 : shotPower(p.shotHold, k);
    p.shotHold = -1;
    p.bufShoot = hasBall ? 1 : Math.max(1, Math.round(tuning.input.bufferTime * tuning.sim.tickRate));
  }
}

/**
 * Should the queued shot be a turn shot (media vuelta, F1.5b)? Near the goal, aimed at it, and
 * more than turnMinAngle away from where he faces.
 */
export function needsTurn(p: PlayerState, ball: BallState, plan: ShotPlan, tuning: Tuning): boolean {
  const k = shotFor(p, tuning);
  return !p.shotTurned && plan.aimed && goalDistance(p, ball) <= k.turnRange && Math.abs(wrapAngle(plan.angle - p.heading)) > k.turnMinAngle;
}

/** Start the quick turn towards the shot (the ball stays on the stick; the shot leaves at the end). */
export function startTurn(p: PlayerState, plan: ShotPlan, tuning: Tuning): void {
  p.shotTurn = Math.max(1e-3, shotFor(p, tuning).turnTime);
  p.shotTurnFrom = p.heading;
  p.shotTurnTo = plan.angle;
  p.bufShoot = 0;
}

/**
 * One tick of a turn shot, after the player has moved: rotate him (smoothly) towards the shot;
 * at the end queue the shot. Losing the ball cancels it.
 */
export function stepTurn(p: PlayerState, hasBall: boolean, tuning: Tuning, dt: number): void {
  if (p.shotTurn <= 0) return;
  if (!hasBall) {
    p.shotTurn = 0;
    return;
  }
  const total = Math.max(1e-3, shotFor(p, tuning).turnTime);
  p.shotTurn = Math.max(0, p.shotTurn - dt);
  const u = Math.min(1, 1 - p.shotTurn / total);
  const e = u * u * (3 - 2 * u);
  p.heading = wrapAngle(p.shotTurnFrom + wrapAngle(p.shotTurnTo - p.shotTurnFrom) * e);
  if (p.shotTurn === 0) {
    p.shotTurned = true;
    p.bufShoot = 1;
  }
}

/** A shot worked out before the human error: what the reticle shows and what gets launched. */
export interface ShotPlan {
  kind: ShotKind;
  /** It goes towards the goal: where it crosses the goal line (sim x, y) and how high (m). */
  aimed: boolean;
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Horizontal direction (rad), elevation (rad) and launch speed (m/s). */
  angle: number;
  elevation: number;
  speed: number;
  /** Where the ball was (sim x, y): the distance and angle of the error model (F1.5c). */
  fromX: number;
  fromY: number;
}

export function createShotPlan(): ShotPlan {
  return { kind: SHOT_LOW, aimed: false, targetX: 0, targetY: 0, targetZ: 0, angle: 0, elevation: 0, speed: 0, fromX: 0, fromY: 0 };
}

/** Below this stick magnitude the stick is "released". */
const AIM_MIN_STICK = 0.05;
/** A shot aimed nowhere in particular is computed for this distance (m). */
const DEFAULT_DISTANCE = 15;
/** Steepest a high shot is hit (rad). */
const HIGH_MAX_ELEVATION = 0.6;
const BISECT = 24;

/** Height (m) of a ball launched from the floor at speed v and elevation e when it has covered `dist` horizontally (−1 if it lands before). */
export function heightAt(v: number, e: number, dist: number, k: Tuning['ball']): number {
  let vh = v * Math.cos(e);
  let vz = v * Math.sin(e);
  let x = 0;
  let z = RINK.ballRadius;
  let t = 0;
  while (x < dist && t < SOLVER_MAX_TIME) {
    vz -= GRAVITY * SOLVER_DT;
    const s = Math.max(0, 1 - k.airDrag * Math.hypot(vh, vz) * SOLVER_DT);
    vh *= s;
    vz *= s;
    x += vh * SOLVER_DT;
    z += vz * SOLVER_DT;
    t += SOLVER_DT;
    if (z < RINK.ballRadius && vz < 0) return -1;
  }
  return x >= dist ? z : -1;
}

/** Aim range (rad from the centre of the goal to a post) and error factor of an assist level. */
function aimRange(level: AssistLevel, k: Tuning['shot']): number {
  return level === 'strong' ? k.strongAimRange : level === 'light' ? k.lightAimRange : k.mediumAimRange;
}

export function shotErrorFactor(level: AssistLevel, k: Tuning['shot']): number {
  return level === 'strong' ? k.strongErrorFactor : level === 'medium' ? k.mediumErrorFactor : 1;
}

/** Speed factor of the shotPower attribute: powerGain faster at 90 than at 40, 1 at 75 (F1.5c). */
export function shotPowerFactor(p: PlayerState, k: Tuning['shot']): number {
  const at = (power: number): number => 1 + k.powerGain * ((power - 40) / 50);
  return at(Math.min(99, Math.max(0, p.shotPower))) / at(75);
}

/**
 * Work out the shot of player `p` (carrying `ball`) with the stick in `cmd`: where it goes, and
 * the launch for its kind, power (`charge` 0..1) or quick shot. No human error: used for the
 * reticle while carrying the ball and for the launch.
 */
export function planShot(p: PlayerState, ball: BallState, cmd: PlayerCommand, level: AssistLevel, kind: ShotKind, charge: number, quick: boolean, tuning: Tuning, out: ShotPlan): ShotPlan {
  const k = shotFor(p, tuning);
  const kb = tuning.ball;
  const side = attackedSide(p);
  const gx = goalLineX(side);
  const toCentre = Math.atan2(-ball.y, gx - ball.x);
  const mag = Math.hypot(cmd.moveX, cmd.moveY);
  const stick = mag >= AIM_MIN_STICK ? Math.atan2(cmd.moveY, cmd.moveX) : Number.NaN;
  const half = RINK.goalWidth / 2 - k.postMargin;
  out.kind = kind;
  out.targetX = gx;
  out.fromX = ball.x;
  out.fromY = ball.y;
  out.aimed = false;
  // Option A: the stick's angle from the centre of the goal, magnified (a post at aimRange).
  const pointing = Number.isNaN(stick) ? p.heading : stick;
  // With the stick released near the goal the shot aims at it whichever way he faces (a turn shot, F1.5b).
  const releasedNear = Number.isNaN(stick) && Math.hypot(gx - ball.x, ball.y) <= k.turnRange;
  if (level !== 'off' && (releasedNear || Math.abs(wrapAngle(pointing - toCentre)) <= k.aimMaxOff)) {
    out.aimed = true;
    if (Number.isNaN(stick)) out.targetY = (ball.y >= 0 ? -1 : 1) * half * k.farPost;
    else out.targetY = side * Math.max(-1, Math.min(1, wrapAngle(stick - toCentre) / Math.max(0.01, aimRange(level, k)))) * half;
    out.angle = Math.atan2(out.targetY - ball.y, gx - ball.x);
  } else {
    // Assist off, or not pointing at the goal: where the stick (or the body) points.
    out.angle = pointing;
    const c = Math.cos(pointing);
    if (c * side > 0.05) {
      out.targetY = ball.y + (Math.sin(pointing) / c) * (gx - ball.x);
      out.aimed = Math.abs(out.targetY) < RINK.width / 2;
    }
  }
  const dist = out.aimed ? Math.max(0.5, Math.hypot(gx - ball.x, out.targetY - ball.y)) : DEFAULT_DISTANCE;
  if (kind === SHOT_CHIP) {
    out.elevation = k.chipAngle;
    out.speed = loftPassSpeed(dist + k.chipLandBeyond, k.chipAngle, k.chipMaxSpeed, kb);
    out.targetZ = Math.max(RINK.ballRadius, heightAt(out.speed, out.elevation, dist, kb));
    return out;
  }
  out.speed = (quick ? k.quickSpeed : k.minSpeed + (Math.max(k.minSpeed, k.maxSpeed) - k.minSpeed) * charge) * shotPowerFactor(p, k);
  if (kind === SHOT_LOW) {
    out.elevation = 0;
    out.targetZ = RINK.ballRadius;
    return out;
  }
  // High: the lowest elevation that crosses the goal line at highHeight.
  let lo = 0;
  let hi = HIGH_MAX_ELEVATION;
  if (heightAt(out.speed, hi, dist, kb) < k.highHeight) lo = hi;
  else {
    for (let i = 0; i < BISECT; i++) {
      const mid = (lo + hi) / 2;
      if (heightAt(out.speed, mid, dist, kb) < k.highHeight) lo = mid;
      else hi = mid;
    }
    lo = hi;
  }
  out.elevation = lo;
  out.targetZ = Math.max(RINK.ballRadius, heightAt(out.speed, lo, dist, kb));
  return out;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Direction error (rad, one standard deviation) of this player's shot right now. `pressure` is
 * the nearest rival's (0..1; F1.6/F2). Context (F1.5c, option 2): distance, a closed angle,
 * a real sprint with the ball, off balance and pressure raise it, each by its weight; all the
 * weights at 0 give the v0.1.25 error exactly.
 */
export function shotErrorSd(p: PlayerState, plan: ShotPlan, quick: boolean, charge: number, level: AssistLevel, tuning: Tuning, pressure = 0): number {
  const k = shotFor(p, tuning);
  const sk = skatingFor(p, tuning);
  const above = Math.hypot(p.vx, p.vy) - sk.maxSpeed;
  // v0.1.25 measured the sprint against the sprint without the ball, which a player carrying it
  // never reaches (≤ ~0.6°); ctxSprint moves it to the real top speed with the ball.
  const sprintOld = clamp01(above / Math.max(0.1, sk.sprintSpeed - sk.maxSpeed));
  const sprintReal = clamp01(above / Math.max(0.1, dribbleFor(p, tuning).sprintSpeedWithBall - sk.maxSpeed));
  const sprint = sprintOld + clamp01(k.ctxSprint) * (sprintReal - sprintOld);
  const offBalance = isSkidding(p) || isCutting(p) ? 1 : 0;
  const turn = Math.max(0, Math.abs(wrapAngle(plan.angle - p.heading)) - k.turnFree);
  // Option 3 (off by default): past the sweet spot of the charge the base error grows again.
  const sweet = !quick && k.sweetSpot >= 0.5 ? 1 + k.sweetSpotError * clamp01((charge - k.sweetSpotStart) / Math.max(0.01, 1 - k.sweetSpotStart)) : 1;
  const base = k.errorBase * (quick ? 1 : 1 - k.chargePrecision * charge) * sweet;
  const skill = clamp01(p.shotAccuracy / 99);
  // First touch (F1.5b): harder after a hard reception and the more it turns the ball's path.
  const firstTouch = p.firstTouchTicks > 0;
  const redirect = firstTouch && !Number.isNaN(p.receivedBallAngle) ? Math.max(0, Math.abs(wrapAngle(plan.angle - p.receivedBallAngle)) - k.redirectFree) : 0;
  const situation = (firstTouch ? k.firstTouchError * (1 + Math.max(0, p.receiveDifficulty)) : 1) * (p.shotTurned ? k.turnError : 1);
  // Distance and angle from the centre of the goal (behind the goal line = the full angle).
  const ahead = attackedSide(p) * (plan.targetX - plan.fromX);
  const dist = Math.hypot(ahead, plan.fromY);
  const angle = Math.atan2(Math.abs(plan.fromY), ahead);
  const context =
    (1 + k.ctxDistance * Math.max(0, dist - k.ctxDistanceFree)) *
    (1 + k.ctxAngle * Math.min(1, angle / Math.max(0.01, k.ctxAngleFull))) *
    (1 + k.ctxPressure * clamp01(pressure));
  const common = k.errorTurn * turn + k.errorRedirect * redirect;
  const v0125 = base + k.errorSprint * sprintOld + k.errorOffBalance * offBalance + common;
  const now = base * context + k.errorSprint * sprint + k.errorOffBalance * (1 + k.ctxOffBalance) * offBalance + common;
  // The assist takes away part of the context's extra (Mitjana half of ctxAssist, Forta all).
  const share = level === 'strong' ? 1 : level === 'medium' ? 0.5 : 0;
  const raw = v0125 + (now - v0125) * (1 - clamp01(k.ctxAssist * share));
  return raw * situation * shotErrorFactor(level, k) * (1 - k.attributeAdvantage * skill);
}

export interface ShotResult {
  kind: ShotKind;
  /** Where it was aimed on the goal line (before the error) and the launch actually given. */
  targetY: number;
  targetZ: number;
  aimed: boolean;
  angle: number;
  elevation: number;
  speed: number;
  /** A first-touch shot / after a turn (F1.5b). */
  firstTouch: boolean;
  turned: boolean;
}

export function createShotResult(): ShotResult {
  return { kind: SHOT_LOW, targetY: 0, targetZ: 0, aimed: false, angle: 0, elevation: 0, speed: 0, firstTouch: false, turned: false };
}

const planTmp = createShotPlan();

/**
 * Player `p` shoots the ball he is carrying with the kind / power queued by TIRO and the stick
 * in `cmd`: a small deterministic error (direction, height, strength), then plain physics.
 */
export function performShot(p: PlayerState, ball: BallState, cmd: PlayerCommand, level: AssistLevel, rng: RngState, tuning: Tuning, out: ShotResult, pressure = 0): ShotResult {
  const k = shotFor(p, tuning);
  const plan = planShot(p, ball, cmd, level, p.shotKind as ShotKind, p.shotCharge, p.shotQuick, tuning, planTmp);
  const sd = shotErrorSd(p, plan, p.shotQuick, p.shotCharge, level, tuning, pressure);
  const angle = plan.angle + gaussian(rng) * sd;
  const elevation = plan.kind === SHOT_LOW ? 0 : Math.max(0, plan.elevation + gaussian(rng) * sd * k.errorHeight);
  const speed = plan.speed * Math.max(0.5, 1 + gaussian(rng) * k.errorPower);
  releaseBall(ball, p, tuning);
  const h = speed * Math.cos(elevation);
  ball.vx = Math.cos(angle) * h;
  ball.vy = Math.sin(angle) * h;
  ball.vz = speed * Math.sin(elevation);
  ball.z = RINK.ballRadius;
  out.firstTouch = p.firstTouchTicks > 0;
  out.turned = p.shotTurned;
  p.bufShoot = 0;
  p.bufPass = 0;
  p.passHold = -1;
  p.shotTurned = false;
  out.kind = plan.kind;
  out.targetY = plan.targetY;
  out.targetZ = plan.targetZ;
  out.aimed = plan.aimed;
  out.angle = angle;
  out.elevation = elevation;
  out.speed = speed;
  return out;
}
