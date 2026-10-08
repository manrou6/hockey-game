import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { ballParams, GRAVITY, type BallState } from './ball';
import type { PlayerCommand } from './commands';
import { bladePoint } from './dribble';
import { dribbleFor, receiveFor, shotFor, skatingFor, volleyFor } from './feel';
import { gaussian, type AssistLevel } from './pass';
import { isCutting, isSkidding, type PlayerState } from './player';
import type { RngState } from './rng';
import { heightAt, planShot, SHOT_CHIP, SHOT_HIGH, shotErrorSd, shotPowerFactor, type ShotKind, type ShotPlan, type ShotResult } from './shot';

// Remate en el aire / volea (F1.5d, docs/03 §3). The same TIRO as the shot: a ball in the air
// that comes to the controlled player's stick is struck without controlling it, if TIRO is
// released within a short timing span around the moment it gets there. The ball's path is followed
// ahead with the same physics (gravity, air drag, floor bounces) to know when and how high it
// reaches the blade; the HUD lights the TIR button during the timing span.

const R = RINK.ballRadius;

export interface VolleyContact {
  /** The ball will pass within reach of his blade (at any height). */
  passes: boolean;
  /** ... and at the right height for a remate en el aire. */
  found: boolean;
  /** Seconds until it is closest to the blade (0 = now), its height above the floor (m) and its distance from the blade (m) then. */
  time: number;
  height: number;
  dist: number;
}

export function createVolleyContact(): VolleyContact {
  return { passes: false, found: false, time: 0, height: 0, dist: 0 };
}

/**
 * Follow the loose ball ahead (lookahead s, one tick per step) and find where it passes closest
 * to player `p`'s blade (the blade moving with his velocity) within reach and between minHeight
 * and maxHeight above the floor. Only the first passage within reach counts.
 */
export function predictContact(ball: BallState, p: PlayerState, tuning: Tuning, out: VolleyContact): VolleyContact {
  const v = volleyFor(p, tuning);
  const k = ballParams(tuning);
  const dt = 1 / tuning.sim.tickRate;
  const steps = Math.max(1, Math.ceil(v.lookahead / dt));
  const blade = bladePoint(p, tuning);
  let x = ball.x;
  let y = ball.y;
  let z = ball.z;
  let vx = ball.vx;
  let vy = ball.vy;
  let vz = ball.vz;
  out.found = false;
  out.passes = false;
  let best = Infinity;
  let inside = false;
  for (let j = 0; j <= steps; j++) {
    if (j > 0) {
      const onFloor = z <= R + 1e-4 && vz <= 1e-3;
      if (onFloor) {
        vz = 0;
        z = R;
        const hs = Math.hypot(vx, vy);
        if (hs > 0) {
          const ns = Math.max(0, hs - (k.rollingDecel + k.rollingDrag * hs) * dt);
          vx *= ns / hs;
          vy *= ns / hs;
        }
      } else vz -= GRAVITY * dt;
      const sp = Math.hypot(vx, vy, vz);
      const s = Math.max(0, 1 - k.airDrag * sp * dt);
      vx *= s;
      vy *= s;
      vz *= s;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      if (z < R) {
        z = R;
        if (vz < 0) {
          vz = -vz * k.floorRestitution;
          vx *= 1 - k.floorFriction;
          vy *= 1 - k.floorFriction;
        }
      }
    }
    const t = j * dt;
    const d = Math.hypot(x - (blade.x + p.vx * t), y - (blade.y + p.vy * t));
    if (d > v.reach) {
      if (inside) break; // past him: the first passage is enough
      continue;
    }
    inside = true;
    out.passes = true;
    const h = z - R;
    if (h >= v.minHeight && h <= v.maxHeight && d < best) {
      best = d;
      out.found = true;
      out.time = t;
      out.height = h;
      out.dist = d;
    }
  }
  return out;
}

/**
 * How hard striking this ball in the air is (0 = trivial; it multiplies the error as a hard
 * reception does): its speed relative to him (from easySpeed to hardSpeed), coming from behind,
 * his state, stretching for it, and a contact lower than idealLow or higher than idealHigh.
 * Control helps, as in a reception.
 */
export function volleyDifficulty(ball: BallState, p: PlayerState, height: number, bladeDist: number, tuning: Tuning): number {
  const r = receiveFor(p, tuning);
  const v = volleyFor(p, tuning);
  const k = skatingFor(p, tuning);
  const d = dribbleFor(p, tuning);
  const rvx = ball.vx - p.vx;
  const rvy = ball.vy - p.vy;
  const s = Math.hypot(rvx, rvy);
  const speed = Math.max(0, (s - v.easySpeed) / Math.max(0.1, v.hardSpeed - v.easySpeed));
  const from = s > 1e-6 ? -(rvx * Math.cos(p.heading) + rvy * Math.sin(p.heading)) / s : 1;
  const behind = r.behindPenalty * ((1 - from) / 2) * Math.min(1, s / Math.max(0.1, r.easySpeed));
  const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
  const low = v.lowPenalty * clamp01((v.idealLow - height) / Math.max(0.01, v.idealLow - v.minHeight));
  const high = v.highPenalty * clamp01((height - v.idealHigh) / Math.max(0.01, v.maxHeight - v.idealHigh));
  const pv = Math.hypot(p.vx, p.vy);
  const sprintFrom = k.maxSpeed + 0.05;
  const sprint = r.sprintPenalty * clamp01((pv - sprintFrom) / Math.max(0.1, k.sprintSpeed - sprintFrom));
  const offBalance = isSkidding(p) || isCutting(p) ? r.offBalancePenalty : 0;
  const stretch = r.stretchPenalty * clamp01((bladeDist - d.pickupRadius) / Math.max(0.1, r.reach));
  const control = clamp01(p.control / 99);
  return (speed + behind + low + high + sprint + offBalance + stretch) * (1 - r.controlAdvantage * control);
}

/** Error factor of the timing (s from the contact): 1 within `good`, up to 1 + badError at the edge of the timing span. */
export function volleyTimingFactor(timing: number, v: Tuning['volley']): number {
  const late = Math.abs(timing) - v.good;
  if (late <= 0) return 1;
  return 1 + v.badError * Math.min(1, late / Math.max(0.01, v.windowTime / 2 - v.good));
}

/** Speed factor of the timing: 1 + powerBonus when perfect, down to 1 at ±good. */
export function volleyPowerFactor(timing: number, v: Tuning['volley']): number {
  return 1 + v.powerBonus * Math.max(0, 1 - Math.abs(timing) / Math.max(1e-3, v.good));
}

/** Elevation (rad) for a ball hit from height z0 at speed v to cross dist m away at height `to`. */
function elevationFrom(v: number, dist: number, z0: number, to: number, kb: Tuning['ball']): number {
  let lo = -0.6;
  let hi = 0.6;
  const at = (e: number): number => heightAt(v, e, dist, kb, z0);
  if (at(hi) >= 0 && at(hi) < to) return hi;
  const atLo = at(lo);
  if (atLo >= to) return lo;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const h = at(mid);
    if (h < 0 || h < to) lo = mid;
    else hi = mid;
  }
  return hi;
}

const planTmp: ShotPlan = {
  kind: SHOT_HIGH, aimed: false, targetX: 0, targetY: 0, targetZ: 0, angle: 0, elevation: 0, speed: 0, fromX: 0, fromY: 0,
};

/**
 * Player `p` strikes the loose ball in the air (`timing` s from the contact, the ball `height`
 * m above the floor, `bladeDist` m from his blade), with the kind / power of the TIRO he
 * released and the stick in `cmd`. The error is the shot's (context included) × firstTouchError
 * × (1 + difficulty in the air) × the timing factor; the speed the shot's (at least the quick
 * shot's) × the timing bonus. Then plain physics from where the ball is.
 */
export function strikeVolley(
  p: PlayerState,
  ball: BallState,
  cmd: PlayerCommand,
  level: AssistLevel,
  timing: number,
  height: number,
  bladeDist: number,
  pressure: number,
  rng: RngState,
  tuning: Tuning,
  out: ShotResult,
): ShotResult {
  const k = shotFor(p, tuning);
  const v = volleyFor(p, tuning);
  const kind = p.shotKind as ShotKind;
  // The error of a first touch with the difficulty of this ball in the air (src/sim/shot.ts).
  p.receivedBallAngle = Math.atan2(ball.vy - p.vy, ball.vx - p.vx);
  p.receiveDifficulty = volleyDifficulty(ball, p, height, bladeDist, tuning);
  p.firstTouchTicks = Math.max(1, p.firstTouchTicks);
  const plan = planShot(p, ball, cmd, level, kind, p.shotCharge, p.shotQuick, tuning, planTmp);
  const sd = shotErrorSd(p, plan, p.shotQuick, p.shotCharge, level, tuning, pressure) * volleyTimingFactor(timing, v);
  // Speed: never less than a quick shot (holding TIRO while the ball comes may charge it), × the timing bonus.
  const base = Math.max(k.quickSpeed * shotPowerFactor(p, k), plan.speed);
  const speed = base * volleyPowerFactor(timing, v) * Math.max(0.5, 1 + gaussian(rng) * k.errorPower);
  const dist = Math.max(0.5, Math.hypot(plan.targetX - ball.x, plan.targetY - ball.y));
  const z0 = ball.z;
  const elevation = kind === SHOT_CHIP ? plan.elevation : elevationFrom(speed, dist, z0, kind === SHOT_HIGH ? k.highHeight : v.lowTarget, tuning.ball);
  const angle = plan.angle + gaussian(rng) * sd;
  const e = elevation + gaussian(rng) * sd * k.errorHeight;
  const h = speed * Math.cos(e);
  ball.owner = -1;
  ball.vx = Math.cos(angle) * h;
  ball.vy = Math.sin(angle) * h;
  ball.vz = speed * Math.sin(e);
  p.noPickupTicks = Math.round(dribbleFor(p, tuning).relockTime * tuning.sim.tickRate);
  out.kind = plan.kind;
  out.targetY = plan.targetY;
  out.targetZ = plan.targetZ;
  out.aimed = plan.aimed;
  out.angle = angle;
  out.elevation = e;
  out.speed = speed;
  out.firstTouch = true;
  out.turned = false;
  out.aerial = true;
  out.timing = timing;
  out.contactHeight = height;
  p.firstTouchTicks = 0;
  p.bufShoot = 0;
  p.bufPass = 0;
  p.passHold = -1;
  p.shotHold = -1;
  p.shotSinceRelease = 1e6;
  return out;
}
