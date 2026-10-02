import { goalLineX, RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import type { BallState } from './ball';
import type { PlayerCommand } from './commands';
import type { PlayerState } from './player';
import { boardSignedDistance, collideBox, goalFootprints, type Contact } from './rink';
import { nextFloat, type RngState } from './rng';

// Carrying the ball on the stick (docs/03 §2: "imantada" with a margin). At normal speed
// the ball stays glued to the blade with a tiny touch rhythm; it only separates when
// sprinting, turning tight at speed or under pressure, and the Control attribute reduces
// that. Too much separation can lose the ball.

const n = { nx: 0, ny: 0 };
const contact: Contact = { depth: 0, nx: 0, ny: 0 };
const GOALS = goalFootprints();

/** Where the blade is: ahead of the body and to the right of the heading. */
export function bladePoint(p: PlayerState, tuning: Tuning, extraForward = 0): { x: number; y: number } {
  const d = tuning.dribble;
  const c = Math.cos(p.heading);
  const s = Math.sin(p.heading);
  // Right of heading in the rink plane (x, y counter-clockwise): (sin, −cos).
  return { x: p.x + c * (d.stickForward + extraForward) + s * d.stickSide, y: p.y + s * (d.stickForward + extraForward) - c * d.stickSide };
}

/** 0..1 pressure from the nearest opponent (0 = nobody within pressureRadius). */
export function pressureOn(p: PlayerState, players: readonly PlayerState[], tuning: Tuning): number {
  const R = tuning.dribble.pressureRadius;
  let best = 0;
  for (const o of players) {
    if (o === p || o.team === p.team) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y) - tuning.skating.radius * 2;
    best = Math.max(best, Math.min(1, Math.max(0, (R - d) / R)));
  }
  return best;
}

/** Separation the dribble is heading to, given the current situation (m). */
export function targetSeparation(p: PlayerState, pressure: number, tuning: Tuning): number {
  const d = tuning.dribble;
  const k = tuning.skating;
  const speed = Math.hypot(p.vx, p.vy);
  // Sprint only counts once actually faster than the normal top speed.
  const sprintFrom = k.maxSpeed + 0.05;
  const sprint = Math.min(1, Math.max(0, (speed - sprintFrom) / Math.max(0.1, d.sprintSpeedWithBall - sprintFrom)));
  // Only very tight turns count (normal curves keep the ball glued).
  const tight = Math.max(0, (p.turnLock - d.turnThreshold) / Math.max(1e-6, 1 - d.turnThreshold));
  const turn = tight * Math.min(1, speed / k.maxSpeed);
  const control = Math.min(1, Math.max(0, p.control / 99));
  const raw = d.baseSeparation + d.sprintSeparation * sprint + d.turnSeparation * turn + d.pressureSeparation * pressure;
  return raw * (1 - d.controlAdvantage * control);
}

/**
 * Carrying the ball over a goal line through the mouth puts it in the net (the stick lets
 * go and the ball physics + goal detection take over). Returns true if that happened.
 */
function enteredGoal(ball: BallState): boolean {
  const r = RINK.ballRadius;
  for (const side of [-1, 1] as const) {
    const gx = goalLineX(side);
    if (side * (ball.x - gx) > 0 && side * (ball.prevX - gx) <= 0 && Math.abs(ball.y) < RINK.goalWidth / 2 - r) {
      ball.inGoal = side;
      return true;
    }
  }
  return false;
}

/** Keep a ball position inside the boards and out of the goal cages. */
function keepInPlay(ball: BallState): void {
  const r = RINK.ballRadius;
  const sd = boardSignedDistance(ball.x, ball.y, n);
  if (sd + r > 0) {
    ball.x -= n.nx * (sd + r);
    ball.y -= n.ny * (sd + r);
  }
  for (const g of GOALS) {
    if (collideBox(ball.x, ball.y, r, g, contact)) {
      ball.x += contact.nx * contact.depth;
      ball.y += contact.ny * contact.depth;
    }
  }
}

/**
 * One tick of carrying the ball. Returns false if the ball got away this tick (then it is
 * loose, rolling on with its current velocity).
 */
export function stepDribble(ball: BallState, owner: PlayerState, players: readonly PlayerState[], tuning: Tuning, rng: RngState, dt: number): boolean {
  const d = tuning.dribble;
  const r = RINK.ballRadius;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.prevZ = ball.z;

  const speed = Math.hypot(owner.vx, owner.vy);
  const target = targetSeparation(owner, pressureOn(owner, players, tuning), tuning);
  // Separation changes smoothly (no pops), quicker to grow than to settle back.
  const rate = target > ball.separation ? 10 : 5;
  ball.separation += (target - ball.separation) * Math.min(1, rate * dt);

  // Touch rhythm: push the ball out by `separation` and catch it again, once per touchDistance.
  ball.touchPhase = (ball.touchPhase + (speed * dt) / Math.max(0.2, d.touchDistance)) % 1;
  const push = ball.separation * 0.5 * (1 - Math.cos(ball.touchPhase * Math.PI * 2));
  const t = bladePoint(owner, tuning, push);

  // Follow the blade: first move with the skater (so there is no lag at constant speed),
  // then close the remaining gap exponentially (frame-rate independent, never overshoots).
  // Only turns and the touch rhythm leave a small, natural lag.
  ball.x += owner.vx * dt;
  ball.y += owner.vy * dt;
  const follow = d.followTime > 0 ? 1 - Math.exp(-dt / d.followTime) : 1;
  ball.x += (t.x - ball.x) * follow;
  ball.y += (t.y - ball.y) * follow;
  ball.z = r;
  const scoring = enteredGoal(ball);
  if (!scoring) keepInPlay(ball);
  ball.vx = (ball.x - ball.prevX) / dt;
  ball.vy = (ball.y - ball.prevY) / dt;
  ball.vz = 0;
  if (scoring) {
    releaseBall(ball, owner, tuning);
    return false;
  }

  // Too much separation: the ball may get away (deterministic random).
  const excess = ball.separation - d.safeSeparation;
  if (excess > 0 && nextFloat(rng) < excess * d.lossRate * dt) {
    releaseBall(ball, owner, tuning);
    // It keeps rolling ahead a bit faster than the skater.
    ball.vx = owner.vx * 1.1 + Math.cos(owner.heading) * 0.5;
    ball.vy = owner.vy * 1.1 + Math.sin(owner.heading) * 0.5;
    return false;
  }
  return true;
}

/** The player lets go of the ball (pass, shot, loss). */
export function releaseBall(ball: BallState, owner: PlayerState, tuning: Tuning): void {
  ball.owner = -1;
  ball.separation = 0;
  owner.noPickupTicks = Math.round(tuning.dribble.relockTime * tuning.sim.tickRate);
}

/** Can this player take the loose ball right now? */
export function canPickUp(ball: BallState, p: PlayerState, tuning: Tuning): boolean {
  const d = tuning.dribble;
  if (ball.owner !== -1 || ball.inGoal !== 0 || p.noPickupTicks > 0) return false;
  if (ball.z - RINK.ballRadius > d.pickupMaxHeight) return false;
  const b = bladePoint(p, tuning);
  if (Math.hypot(ball.x - b.x, ball.y - b.y) > d.pickupRadius) return false;
  return Math.hypot(ball.vx - p.vx, ball.vy - p.vy) <= d.pickupMaxRelSpeed;
}

export function pickUp(ball: BallState, index: number, p: PlayerState): void {
  ball.owner = index;
  ball.touchPhase = 0;
  ball.separation = Math.min(0.3, Math.hypot(ball.x - p.x, ball.y - p.y) * 0.2);
  ball.z = RINK.ballRadius;
  ball.vz = 0;
}

/** Record button presses in the player's input buffer (docs/03 §3: 150 ms). */
export function bufferActions(p: PlayerState, cmd: PlayerCommand, tuning: Tuning): void {
  const ticks = Math.max(1, Math.round(tuning.input.bufferTime * tuning.sim.tickRate));
  p.bufPass = cmd.pass ? ticks : Math.max(0, p.bufPass - 1);
  p.bufShoot = cmd.shoot ? ticks : Math.max(0, p.bufShoot - 1);
  p.bufDribble = cmd.dribble ? ticks : Math.max(0, p.bufDribble - 1);
  if (p.noPickupTicks > 0) p.noPickupTicks--;
}

/**
 * PROVISIONAL pass and quick shot (replaced by the full mechanics in F1.4 / F1.5), so the
 * ball can already be released while tuning the dribble. Returns true if the ball left.
 */
export function provisionalActions(ball: BallState, p: PlayerState, cmd: PlayerCommand, tuning: Tuning): boolean {
  const d = tuning.dribble;
  if (p.bufShoot > 0) {
    // Towards the centre of the goal being attacked if roughly facing it, else straight ahead.
    const goalX = (p.team === 0 ? 1 : -1) * (RINK.length / 2 - RINK.goalLineFromEnd);
    const toGoal = Math.atan2(-p.y, goalX - p.x);
    let diff = toGoal - p.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const a = Math.abs(diff) < 1.3 ? toGoal : p.heading;
    releaseBall(ball, p, tuning);
    ball.vx = Math.cos(a) * d.shotSpeed;
    ball.vy = Math.sin(a) * d.shotSpeed;
    ball.vz = 1.2;
    p.bufShoot = 0;
    p.bufPass = 0;
    return true;
  }
  if (p.bufPass > 0) {
    const m = Math.hypot(cmd.moveX, cmd.moveY);
    const a = m > 0.05 ? Math.atan2(cmd.moveY, cmd.moveX) : p.heading;
    releaseBall(ball, p, tuning);
    ball.vx = Math.cos(a) * d.passSpeed;
    ball.vy = Math.sin(a) * d.passSpeed;
    ball.vz = 0;
    p.bufPass = 0;
    return true;
  }
  return false;
}
