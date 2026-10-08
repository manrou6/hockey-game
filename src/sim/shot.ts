import { goalLineX, RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { GRAVITY, type BallState } from './ball';
import type { PlayerCommand } from './commands';
import { releaseBall } from './dribble';
import { shotFor, skatingFor } from './feel';
import { gaussian, loftPassSpeed, type AssistLevel } from './pass';
import { isCutting, isSkidding, wrapAngle, type PlayerState } from './player';
import type { RngState } from './rng';
import { SOLVER_DT, SOLVER_MAX_TIME } from './rolling';

// The shot (F1.5a, docs/03 §3 TIRO). A tap of TIRO is a quick shot; holding it charges a drag
// shot (the ball glued to the blade, the player a bit slower) whose power and precision grow
// until it is released. The height comes from the same diagonal drag as PASE (low / high /
// chip). Where it goes (option A): the angle of the stick from the direction to the centre of
// the goal, magnified so that a small angle already reaches a post; the stick released = the
// far post. Everything is decided at the release; then the ball is plain physics.

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
 * TIRO button, for the player carrying the ball: the press starts the charge, the release
 * queues the shot (bufShoot) with its kind, whether it was a tap and its power. Pressed without
 * the ball it does nothing yet (shooting at the first touch is F1.5b); losing the ball while
 * charging cancels it. Not while PASE is being held.
 */
export function updateShotButton(p: PlayerState, cmd: PlayerCommand, tuning: Tuning, dt: number, hasBall: boolean): void {
  const k = shotFor(p, tuning);
  if (cmd.shoot && p.shotHold < 0 && hasBall && p.passHold < 0) p.shotHold = 0;
  else if (p.shotHold >= 0) p.shotHold += dt;
  if (p.shotHold < 0) return;
  if (!hasBall) {
    p.shotHold = -1;
    return;
  }
  if (!cmd.shootHeld) {
    p.shotKind = shotKindFromHeight(cmd.shootHeight);
    p.shotQuick = p.shotHold < k.tapTime;
    p.shotCharge = p.shotQuick ? 0 : shotPower(p.shotHold, k);
    p.shotHold = -1;
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
}

export function createShotPlan(): ShotPlan {
  return { kind: SHOT_LOW, aimed: false, targetX: 0, targetY: 0, targetZ: 0, angle: 0, elevation: 0, speed: 0 };
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
  out.aimed = false;
  // Option A: the stick's angle from the centre of the goal, magnified (a post at aimRange).
  const pointing = Number.isNaN(stick) ? p.heading : stick;
  if (level !== 'off' && Math.abs(wrapAngle(pointing - toCentre)) <= k.aimMaxOff) {
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
  out.speed = quick ? k.quickSpeed : k.minSpeed + (Math.max(k.minSpeed, k.maxSpeed) - k.minSpeed) * charge;
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

/** Direction error (rad, one standard deviation) of this player's shot right now. */
export function shotErrorSd(p: PlayerState, plan: ShotPlan, quick: boolean, charge: number, level: AssistLevel, tuning: Tuning): number {
  const k = shotFor(p, tuning);
  const sk = skatingFor(p, tuning);
  const speed = Math.hypot(p.vx, p.vy);
  const sprint = Math.min(1, Math.max(0, (speed - sk.maxSpeed) / Math.max(0.1, sk.sprintSpeed - sk.maxSpeed)));
  const offBalance = isSkidding(p) || isCutting(p) ? 1 : 0;
  const turn = Math.max(0, Math.abs(wrapAngle(plan.angle - p.heading)) - k.turnFree);
  const base = k.errorBase * (quick ? 1 : 1 - k.chargePrecision * charge);
  const skill = Math.min(1, Math.max(0, p.shooting / 99));
  return (base + k.errorSprint * sprint + k.errorOffBalance * offBalance + k.errorTurn * turn) * shotErrorFactor(level, k) * (1 - k.attributeAdvantage * skill);
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
}

export function createShotResult(): ShotResult {
  return { kind: SHOT_LOW, targetY: 0, targetZ: 0, aimed: false, angle: 0, elevation: 0, speed: 0 };
}

const planTmp = createShotPlan();

/**
 * Player `p` shoots the ball he is carrying with the kind / power queued by TIRO and the stick
 * in `cmd`: a small deterministic error (direction, height, strength), then plain physics.
 */
export function performShot(p: PlayerState, ball: BallState, cmd: PlayerCommand, level: AssistLevel, rng: RngState, tuning: Tuning, out: ShotResult): ShotResult {
  const k = shotFor(p, tuning);
  const plan = planShot(p, ball, cmd, level, p.shotKind as ShotKind, p.shotCharge, p.shotQuick, tuning, planTmp);
  const sd = shotErrorSd(p, plan, p.shotQuick, p.shotCharge, level, tuning);
  const angle = plan.angle + gaussian(rng) * sd;
  const elevation = plan.kind === SHOT_LOW ? 0 : Math.max(0, plan.elevation + gaussian(rng) * sd * k.errorHeight);
  const speed = plan.speed * Math.max(0.5, 1 + gaussian(rng) * k.errorPower);
  releaseBall(ball, p, tuning);
  const h = speed * Math.cos(elevation);
  ball.vx = Math.cos(angle) * h;
  ball.vy = Math.sin(angle) * h;
  ball.vz = speed * Math.sin(elevation);
  ball.z = RINK.ballRadius;
  p.bufShoot = 0;
  p.bufPass = 0;
  p.passHold = -1;
  out.kind = plan.kind;
  out.targetY = plan.targetY;
  out.targetZ = plan.targetZ;
  out.aimed = plan.aimed;
  out.angle = angle;
  out.elevation = elevation;
  out.speed = speed;
  return out;
}
