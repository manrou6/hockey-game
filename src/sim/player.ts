import type { Tuning } from '../config/tuning';
import type { PlayerCommand } from './commands';
import { resolveStatic } from './rink';
import { cutFor, dribbleFor, skatingFor } from './feel';

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
  /** Pase attribute 0-99 (docs/01): smaller pass errors. */
  passing: number;
  /** PASE held for this long (s); −1 = not held. On release the pass is queued in bufPass
   * with its kind (lofted or ground) and charge 0..1 (lofted pass to nobody: distance). */
  passHold: number;
  passLoft: boolean;
  passCharge: number;
  /** The last pass this player received was lofted (teammates give it back the same way). */
  receivedLoft: boolean;
  /** Ticks during which this player can't take the ball (just passed / shot / lost it). */
  noPickupTicks: number;
  /** Input buffer (docs/03 §3): ticks left for a PASE / TIRO / REGATE press to still fire. */
  bufPass: number;
  bufShoot: number;
  bufDribble: number;
  /** Sprint push: seconds left of the extra acceleration, and until another one is allowed. */
  boostTime: number;
  boostCooldown: number;
  wasSprinting: boolean;
  /** Four-wheel skid stop: seconds left (0 = not skidding), total, start speed, travel
   * direction, side the body turns to (+1 left / −1 right). */
  skidTime: number;
  skidDuration: number;
  skidSpeed0: number;
  skidDir: number;
  skidSide: number;
  /** Recent stick magnitude (decays over input.skidReleaseWindow) to detect an abrupt release. */
  stickPeak: number;
  /** Side of the last turn (+1 left / −1 right), used for the skid body turn. */
  lastTurnSign: number;
  /** Strength of the current push (sprint push or trencada exit push), and whether it is the
   * sprint one (that one stops when the sprint stops). */
  boostAccel: number;
  boostIsSprint: boolean;
  /** Trencada (lateral cut): seconds left, total, start speed, old and new direction, body
   * turn side, and time until another cut is allowed. */
  cutTime: number;
  cutDuration: number;
  cutSpeed0: number;
  cutFrom: number;
  cutTo: number;
  cutSide: number;
  cutCooldown: number;
  /** Trencada pre-brake phase (s left / total) and the speed when it ended; then the time
   * after the cut during which sprinting is not allowed (has to re-accelerate). */
  cutPrep: number;
  cutPrepDuration: number;
  cutSpeedMid: number;
  cutRecovery: number;
  /** Recent stick directions (rad, NaN = no input), one per tick, to detect a flick. */
  stickHist: number[];
  stickHistIdx: number;
  /** Moves on its own (sim AI) whenever the human is not controlling it (teammates). */
  bot: boolean;
  /** Seconds this bot has been holding the ball (to give it back after a delay). */
  holdTime: number;
  /** Supporting teammate standing at his spot (waits until it moves away enough). */
  botSettled: boolean;
  /** Previous-tick pose, used by the renderer to interpolate between ticks. */
  prevX: number;
  prevY: number;
  prevHeading: number;
}

export function createPlayer(id: number, x: number, y: number, heading = 0): PlayerState {
  return {
    id, x, y, vx: 0, vy: 0, heading, braking: false,
    team: 0, control: 75, passing: 75, passHold: -1, passLoft: false, passCharge: 0, receivedLoft: false, turnLock: 0, noPickupTicks: 0, bufPass: 0, bufShoot: 0, bufDribble: 0,
    boostTime: 0, boostCooldown: 0, wasSprinting: false,
    skidTime: 0, skidDuration: 0, skidSpeed0: 0, skidDir: 0, skidSide: 1, stickPeak: 0, lastTurnSign: 1,
    boostAccel: 0, boostIsSprint: false,
    cutTime: 0, cutDuration: 0, cutSpeed0: 0, cutFrom: 0, cutTo: 0, cutSide: 1, cutCooldown: 0,
    cutPrep: 0, cutPrepDuration: 0, cutSpeedMid: 0, cutRecovery: 0,
    stickHist: new Array<number>(STICK_HISTORY).fill(Number.NaN), stickHistIdx: 0,
    bot: false, holdTime: 0, botSettled: false,
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

/** Ticks of stick-direction history kept for flick detection (0.5 s at 60 Hz). */
const STICK_HISTORY = 32;

/** True during a trencada (pre-brake or the cut itself). */
export function isCutting(p: PlayerState): boolean {
  return p.cutPrep > 0 || p.cutTime > 0;
}

/** Did the stick direction turn by at least `angle` within the last `ticks` ticks? */
function stickFlicked(p: PlayerState, want: number, angle: number, ticks: number): boolean {
  const n = Math.min(STICK_HISTORY, Math.max(1, ticks));
  for (let i = 1; i <= n; i++) {
    const a = p.stickHist[(p.stickHistIdx - i + STICK_HISTORY * 2) % STICK_HISTORY]!;
    if (!Number.isNaN(a) && Math.abs(wrapAngle(want - a)) >= angle) return true;
  }
  return false;
}

/** Timer countdown that lands exactly on 0 (no float residue keeping a state alive a tick longer). */
function countDown(t: number, dt: number): number {
  const left = t - dt;
  return left <= 1e-9 ? 0 : left;
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** True while doing the four-wheel skid stop. */
export function isSkidding(p: PlayerState): boolean {
  return p.skidTime > 0;
}

function startSkid(p: PlayerState, speed: number, dir: number, side: number, tuning: Tuning): void {
  const k = skatingFor(p, tuning);
  p.skidDuration = Math.max(0.05, k.skidTime);
  p.skidTime = p.skidDuration;
  p.skidSpeed0 = speed;
  p.skidDir = dir;
  p.skidSide = side >= 0 ? 1 : -1;
  p.boostTime = 0;
}

/** 0 → 1 → 0 envelope of the body turn during a skid (quick in, hold, ease back at the end). */
function skidBodyEnvelope(u: number): number {
  const ease = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return ease(0, 0.2, u) * (1 - ease(0.7, 1, u));
}

/**
 * One fixed tick of skating (docs/03 §1). The skater has momentum: the stick sets a desired
 * direction and speed, and the body gets there through acceleration (with a short push when a
 * sprint starts), a speed-dependent turning radius, a four-wheel skid stop (stick reversed or
 * released abruptly at speed) and a soft glide when the stick is brought back gently.
 */
export function stepPlayer(p: PlayerState, cmd: PlayerCommand, tuning: Tuning, dt: number, hasBall = false): void {
  const k = skatingFor(p, tuning);
  p.prevX = p.x;
  p.prevY = p.y;
  p.prevHeading = p.heading;

  let speed = Math.hypot(p.vx, p.vy);
  let dir = speed > 1e-4 ? Math.atan2(p.vy, p.vx) : p.heading;

  let mag = Math.hypot(cmd.moveX, cmd.moveY);
  if (mag > 1) mag = 1;
  const hasInput = mag >= MOVE_EPSILON;
  const want = hasInput ? Math.atan2(cmd.moveY, cmd.moveX) : dir;
  const abruptRelease = !hasInput && p.stickPeak >= k.skidReleaseStick && speed >= k.skidMinSpeed;
  p.stickPeak = Math.max(mag, p.stickPeak - dt / Math.max(0.01, k.skidReleaseWindow));
  p.braking = false;
  p.turnLock = 0;
  p.boostCooldown = Math.max(0, p.boostCooldown - dt);
  p.cutCooldown = Math.max(0, p.cutCooldown - dt);
  p.cutRecovery = Math.max(0, p.cutRecovery - dt);

  // --- Trencada (lateral cut that redirects) ------------------------------------------------
  // Two phases: a pre-brake along the old direction (cutPrep, the defender's chance to react),
  // then the cut itself (cutTime) that turns part of the speed into the new direction.
  const c = cutFor(p, tuning);
  const inCut = (): boolean => p.cutPrep > 0 || p.cutTime > 0;
  if (hasInput && !inCut() && p.skidTime <= 0 && p.cutCooldown <= 0 && speed >= c.minSpeed && (c.onlyWithSprint < 0.5 || cmd.sprint)) {
    const diff = wrapAngle(want - dir);
    const gestureTicks = Math.round(c.gestureTime * tuning.sim.tickRate);
    if (Math.abs(diff) >= c.minAngle && Math.abs(diff) <= k.brakeAngle && stickFlicked(p, want, c.minAngle, gestureTicks)) {
      p.cutPrepDuration = Math.max(0, c.prepTime);
      p.cutPrep = p.cutPrepDuration;
      p.cutDuration = Math.max(0.05, c.duration);
      p.cutTime = p.cutDuration;
      p.cutSpeed0 = speed;
      p.cutSpeedMid = speed;
      p.cutFrom = dir;
      p.cutTo = want;
      p.cutSide = diff >= 0 ? 1 : -1;
      p.boostTime = 0;
    }
  }
  // Remember the stick direction (after detection, so the history is "before this tick").
  p.stickHist[p.stickHistIdx] = hasInput ? want : Number.NaN;
  p.stickHistIdx = (p.stickHistIdx + 1) % STICK_HISTORY;
  // Taking the stick back to the old direction cancels the cut (also during the pre-brake).
  // The cooldown still applies, so cancelling is not free either.
  if (inCut() && hasInput && Math.abs(wrapAngle(want - p.cutFrom)) < c.minAngle / 2) {
    p.cutPrep = 0;
    p.cutTime = 0;
    p.cutCooldown = c.cooldown;
  }

  // --- Four-wheel skid stop ----------------------------------------------------------------
  if (!inCut() && p.skidTime <= 0 && speed > k.pivotSpeed) {
    if (hasInput && Math.abs(wrapAngle(want - dir)) > k.brakeAngle) startSkid(p, speed, dir, Math.sign(wrapAngle(want - dir)) || p.lastTurnSign, tuning);
    else if (abruptRelease) startSkid(p, speed, dir, p.lastTurnSign, tuning);
  }
  // Pushing forward again (within the brake angle) cancels the skid.
  if (p.skidTime > 0 && hasInput && Math.abs(wrapAngle(want - p.skidDir)) <= k.brakeAngle) {
    p.skidTime = 0;
    p.heading = p.skidDir;
  }

  if (inCut() && hasInput && Math.abs(wrapAngle(want - p.cutFrom)) >= c.minAngle) p.cutTo = want; // can be steered
  if (p.cutPrep > 0) {
    // Pre-brake: four-wheel braking along the old direction, losing prepSpeedLoss of the
    // speed; the body starts turning towards the cut.
    p.braking = true;
    p.cutPrep = countDown(p.cutPrep, dt);
    const u = p.cutPrepDuration > 0 ? 1 - p.cutPrep / p.cutPrepDuration : 1;
    speed = p.cutSpeed0 * (1 - c.prepSpeedLoss * u);
    dir = p.cutFrom;
    p.heading = wrapAngle(dir + p.cutSide * c.bodyTurn * smooth01(u));
    p.wasSprinting = cmd.sprint;
    if (p.cutPrep === 0) p.cutSpeedMid = speed;
  } else if (p.cutTime > 0) {
    // The cut: sideways four-wheel slide; the remaining old speed fades and `redirect` of the
    // original speed builds up in the new direction.
    p.braking = true;
    p.cutTime = countDown(p.cutTime, dt);
    const u = 1 - p.cutTime / p.cutDuration;
    const e = smooth01(u);
    const oldPart = p.cutSpeedMid * (1 - e);
    const newPart = p.cutSpeed0 * c.redirect * e;
    const vx = Math.cos(p.cutFrom) * oldPart + Math.cos(p.cutTo) * newPart;
    const vy = Math.sin(p.cutFrom) * oldPart + Math.sin(p.cutTo) * newPart;
    speed = Math.hypot(vx, vy);
    dir = speed > 1e-4 ? Math.atan2(vy, vx) : p.cutTo;
    const facing = p.cutFrom + wrapAngle(p.cutTo - p.cutFrom) * e;
    p.heading = wrapAngle(facing + p.cutSide * c.bodyTurn * (1 - e));
    p.wasSprinting = cmd.sprint;
    if (p.cutTime === 0) {
      dir = p.cutTo;
      p.heading = dir;
      // Cooldown counts from the END of the whole manoeuvre; no sprint for a moment after it.
      p.cutCooldown = c.cooldown;
      p.cutRecovery = c.noSprintTime;
      // Soft exit push towards the new direction (shares the cooldown with the sprint push).
      if (p.boostCooldown <= 0 && c.exitTime > 0) {
        p.boostTime = c.exitTime;
        p.boostAccel = c.exitAccel;
        p.boostIsSprint = false;
        p.boostCooldown = k.sprintBoostCooldown;
      }
    }
  } else if (p.skidTime > 0) {
    // Keep sliding the way we were going, losing all speed over skidTime. skidSlide > 1 keeps
    // more speed early (longer slide), < 1 bites harder at the start.
    p.braking = true;
    p.skidTime = countDown(p.skidTime, dt);
    const u = 1 - p.skidTime / p.skidDuration;
    speed = p.skidSpeed0 * Math.pow(Math.max(0, 1 - u), 1 / Math.max(0.1, k.skidSlide));
    dir = p.skidDir;
    p.wasSprinting = false;
    p.heading = wrapAngle(dir + p.skidSide * k.skidBodyTurn * skidBodyEnvelope(u));
    if (p.skidTime === 0) {
      speed = 0;
      p.heading = dir;
    }
  } else if (!hasInput) {
    // Glide: stick brought back gently → slow, smooth deceleration, never a sudden stop.
    speed = Math.max(0, speed - (k.glideDecel + k.glideDrag * speed) * dt);
    p.wasSprinting = false;
  } else {
    // Right after a trencada you can't sprint yet: re-accelerate first.
    const sprinting = cmd.sprint && p.cutRecovery <= 0;
    if (p.cutRecovery > 0) p.wasSprinting = cmd.sprint; // no sprint push when the recovery ends
    // Sprint push: a short burst of extra acceleration when a sprint starts.
    if (sprinting && !p.wasSprinting && p.boostCooldown <= 0) {
      p.boostTime = k.sprintBoostTime;
      p.boostAccel = k.sprintBoostAccel;
      p.boostIsSprint = true;
      p.boostCooldown = k.sprintBoostCooldown;
    }
    p.wasSprinting = sprinting;
    // The sprint push stops when the sprint stops; the trencada exit push runs its course.
    if (p.boostIsSprint && !sprinting) p.boostTime = 0;
    const boosting = p.boostTime > 0;
    p.boostTime = Math.max(0, p.boostTime - dt);

    const cap = sprinting ? (hasBall ? dribbleFor(p, tuning).sprintSpeedWithBall : k.sprintSpeed) : k.maxSpeed;
    const target = sprinting ? cap + (boosting ? k.sprintBoostOvershoot : 0) : cap * mag;
    const diff = wrapAngle(want - dir);
    const pivoting = speed <= k.pivotSpeed;
    // Turning: max angular rate limited by the minimum radius at this speed.
    const maxRate = pivoting ? k.pivotTurnRate : Math.min(k.maxTurnRate, speed / (k.turnRadiusBase + k.turnRadiusPerSpeed2 * speed * speed));
    const maxTurn = maxRate * dt;
    const turn = diff > maxTurn ? maxTurn : diff < -maxTurn ? -maxTurn : diff;
    dir = wrapAngle(dir + turn);
    if (maxTurn > 0) p.turnLock = Math.abs(turn) / maxTurn;
    if (Math.abs(turn) > 1e-4) p.lastTurnSign = turn > 0 ? 1 : -1;
    if (!pivoting && maxTurn > 0) {
      // Turning at full lock bleeds speed; gentle curves are almost free.
      const lock = Math.abs(turn) / maxTurn;
      speed -= k.turnSpeedLoss * Math.abs(turn) * speed * lock * lock;
    }
    if (speed < target) {
      // Strong start that fades towards the cap. When pivoting, push only once facing
      // roughly the right way (turn first, then skate).
      const facing = pivoting ? Math.max(0, Math.cos(wrapAngle(want - dir))) : 1;
      const a = k.accel * facing * Math.max(0, 1 - speed / (cap * k.accelCapFactor)) + (boosting ? p.boostAccel : 0);
      speed = Math.min(target, speed + a * dt);
    } else if (speed > target) {
      // Above the target (sprint over, stick eased back): natural slow-down.
      speed = Math.max(target, speed - k.overspeedDecel * dt);
    }
    p.heading = dir;
  }

  p.vx = Math.cos(dir) * speed;
  p.vy = Math.sin(dir) * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  resolveStatic(p, k.radius, k.wallRestitution, k.wallFriction);
  if (!hasInput && p.skidTime <= 0 && !inCut() && speed < 1e-3) p.heading = dir;
}

/** Separate two overlapping players and exchange the closing part of their velocities. */
export function collidePlayers(a: PlayerState, b: PlayerState, tuning: Tuning): void {
  const r = skatingFor(a, tuning).radius + skatingFor(b, tuning).radius;
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
  const j = ((1 + skatingFor(a, tuning).playerRestitution) * closing) / 2;
  a.vx -= j * nx;
  a.vy -= j * ny;
  b.vx += j * nx;
  b.vy += j * ny;
}
