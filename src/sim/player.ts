import type { Tuning } from '../config/tuning';
import type { PlayerCommand } from './commands';
import { resolveStatic } from './rink';

/** Below this stick magnitude there is no input (the input layer applies the real dead zone). */
const MOVE_EPSILON = 0.01;

/** Player body height for ball contact (m). */
export const PLAYER_HEIGHT = 1.75;

export interface PlayerState {
  id: number;
  /** Position on the rink plane (m). Origin = centre spot, x along length, y along width. */
  x: number;
  y: number;
  /** Velocity (m/s). */
  vx: number;
  vy: number;
  /** Facing angle (rad, 0 = +x, CCW). */
  heading: number;
  /** True while doing a T-stop (stick against the motion). */
  braking: boolean;
  /** Team (0 = human side). Opponents put pressure on the ball carrier. */
  team: number;
  /** Ball control attribute 0-99 (docs/01): less separation and fewer losses when dribbling. */
  control: number;
  /** How hard the skater is turning, 0 (straight) .. 1 (full lock), last tick. */
  turnLock: number;
  /** Ticks during which this player can't take the ball (just passed / shot / lost it). */
  noPickupTicks: number;
  /** Input buffer (docs/03 §3): ticks left for a PASE / TIRO / REGATE press to still fire. */
  bufPass: number;
  bufShoot: number;
  bufDribble: number;
  /** Previous-tick pose, used by the renderer to interpolate between ticks. */
  prevX: number;
  prevY: number;
  prevHeading: number;
}

export function createPlayer(id: number, x: number, y: number, heading = 0): PlayerState {
  return {
    id, x, y, vx: 0, vy: 0, heading, braking: false,
    team: 0, control: 75, turnLock: 0, noPickupTicks: 0, bufPass: 0, bufShoot: 0, bufDribble: 0,
    prevX: x, prevY: y, prevHeading: heading,
  };
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  const TAU = Math.PI * 2;
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/**
 * One fixed tick of skating (docs/03 §1). The skater has momentum: the stick sets a desired
 * direction and speed, and the body gets there through acceleration, a speed-dependent
 * turning radius, T-stop braking and a soft glide when the stick is released.
 */
export function stepPlayer(p: PlayerState, cmd: PlayerCommand, tuning: Tuning, dt: number, hasBall = false): void {
  const k = tuning.skating;
  p.prevX = p.x;
  p.prevY = p.y;
  p.prevHeading = p.heading;

  let speed = Math.hypot(p.vx, p.vy);
  let dir = speed > 1e-4 ? Math.atan2(p.vy, p.vx) : p.heading;

  let mag = Math.hypot(cmd.moveX, cmd.moveY);
  if (mag > 1) mag = 1;
  p.braking = false;
  p.turnLock = 0;

  if (mag < MOVE_EPSILON) {
    // Glide: no input → slow, smooth deceleration, never a sudden stop.
    speed = Math.max(0, speed - (k.glideDecel + k.glideDrag * speed) * dt);
  } else {
    const want = Math.atan2(cmd.moveY, cmd.moveX);
    const cap = cmd.sprint ? (hasBall ? tuning.dribble.sprintSpeedWithBall : k.sprintSpeed) : k.maxSpeed;
    const target = cmd.sprint ? cap : cap * mag;
    const diff = wrapAngle(want - dir);

    if (speed > k.pivotSpeed && Math.abs(diff) > k.brakeAngle) {
      // T-stop: stick pulled against the motion.
      p.braking = true;
      speed = Math.max(0, speed - k.brakeDecel * dt);
    } else {
      const pivoting = speed <= k.pivotSpeed;
      // Turning: max angular rate limited by the minimum radius at this speed.
      const maxRate = pivoting ? k.pivotTurnRate : Math.min(k.maxTurnRate, speed / (k.turnRadiusBase + k.turnRadiusPerSpeed2 * speed * speed));
      const maxTurn = maxRate * dt;
      const turn = diff > maxTurn ? maxTurn : diff < -maxTurn ? -maxTurn : diff;
      dir = wrapAngle(dir + turn);
      if (maxTurn > 0) p.turnLock = Math.abs(turn) / maxTurn;
      if (!pivoting && maxTurn > 0) {
        // Turning at full lock bleeds speed; gentle curves are almost free.
        const lock = Math.abs(turn) / maxTurn;
        speed -= k.turnSpeedLoss * Math.abs(turn) * speed * lock * lock;
      }
      if (speed < target) {
        // Strong start that fades towards the cap. When pivoting, push only once facing
        // roughly the right way (turn first, then skate).
        const facing = pivoting ? Math.max(0, Math.cos(wrapAngle(want - dir))) : 1;
        const a = k.accel * facing * Math.max(0, 1 - speed / (cap * k.accelCapFactor));
        speed = Math.min(target, speed + a * dt);
      } else if (speed > target) {
        speed = Math.max(target, speed - k.overspeedDecel * dt);
      }
    }
  }

  p.vx = Math.cos(dir) * speed;
  p.vy = Math.sin(dir) * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  resolveStatic(p, k.radius, k.wallRestitution, k.wallFriction);

  // Facing follows the direction of travel; when (almost) still it turns to the stick.
  if (!p.braking) p.heading = dir;
}

/** Separate two overlapping players and exchange the closing part of their velocities. */
export function collidePlayers(a: PlayerState, b: PlayerState, tuning: Tuning): void {
  const r = tuning.skating.radius * 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  const d = Math.sqrt(d2);
  // Coincident centres: separate along x deterministically.
  const nx = d > 1e-6 ? dx / d : 1;
  const ny = d > 1e-6 ? dy / d : 0;
  const push = (r - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return;
  // Equal masses for now (Físico attribute in F2).
  const j = ((1 + tuning.skating.playerRestitution) * closing) / 2;
  a.vx -= j * nx;
  a.vy -= j * ny;
  b.vx += j * nx;
  b.vy += j * ny;
}
