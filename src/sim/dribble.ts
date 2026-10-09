import { goalLineX, RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import type { BallState } from './ball';
import type { PlayerCommand } from './commands';
import type { PlayerState } from './player';
import { boardSignedDistance, collideBox, goalFootprints, type Contact } from './rink';
import { nextFloat, type RngState } from './rng';
import { cutFor, dribbleFor, receiveFor, skatingFor } from './feel';

// Carrying the ball on the stick (docs/03 §2: "imantada" with a margin). At normal speed
// the ball stays glued to the blade with a tiny touch rhythm; it only separates when
// sprinting, turning tight at speed or under pressure, and the Control attribute reduces
// that. Too much separation can lose the ball.

const n = { nx: 0, ny: 0 };
const contact: Contact = { depth: 0, nx: 0, ny: 0 };
const GOALS = goalFootprints();

/** Where the blade is: ahead of the body and to the right of the heading. */
export function bladePoint(p: PlayerState, tuning: Tuning, extraForward = 0): { x: number; y: number } {
  const d = dribbleFor(p, tuning);
  const c = Math.cos(p.heading);
  const s = Math.sin(p.heading);
  // Right of heading in the rink plane (x, y counter-clockwise): (sin, −cos).
  return { x: p.x + c * (d.stickForward + extraForward) + s * d.stickSide, y: p.y + s * (d.stickForward + extraForward) - c * d.stickSide };
}

/** 0..1 pressure from the nearest opponent (0 = nobody within pressureRadius). */
export function pressureOn(p: PlayerState, players: readonly PlayerState[], tuning: Tuning): number {
  const R = dribbleFor(p, tuning).pressureRadius;
  let best = 0;
  for (const o of players) {
    if (o === p || o.team === p.team) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y) - skatingFor(p, tuning).radius - skatingFor(o, tuning).radius;
    best = Math.max(best, Math.min(1, Math.max(0, (R - d) / R)));
  }
  return best;
}

/** Separation the dribble is heading to, given the current situation (m). */
export function targetSeparation(p: PlayerState, pressure: number, tuning: Tuning): number {
  const d = dribbleFor(p, tuning);
  const k = skatingFor(p, tuning);
  const speed = Math.hypot(p.vx, p.vy);
  // Sprint only counts once actually faster than the normal top speed.
  const sprintFrom = k.maxSpeed + 0.05;
  const sprint = Math.min(1, Math.max(0, (speed - sprintFrom) / Math.max(0.1, d.sprintSpeedWithBall - sprintFrom)));
  // Only very tight turns count (normal curves keep the ball glued).
  const tight = Math.max(0, (p.turnLock - d.turnThreshold) / Math.max(1e-6, 1 - d.turnThreshold));
  const turn = tight * Math.min(1, speed / k.maxSpeed);
  const control = Math.min(1, Math.max(0, p.control / 99));
  // Four-wheel skid stop at speed: the ball runs on ahead of the stick.
  const skid = p.skidTime > 0 ? Math.min(1, (p.skidSpeed0 * p.skidTime) / Math.max(1e-6, p.skidDuration * k.maxSpeed)) : 0;
  // Trencada at speed: the ball runs on during the cut (Control reduces it as usual).
  const cut = p.cutPrep > 0 || p.cutTime > 0 ? Math.min(1, p.cutSpeed0 / k.maxSpeed) : 0;
  const raw =
    d.baseSeparation + d.sprintSeparation * sprint + d.turnSeparation * turn + d.pressureSeparation * pressure + d.skidSeparation * skid +
    cutFor(p, tuning).ballSeparation * cut;
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
  const d = dribbleFor(owner, tuning);
  const r = RINK.ballRadius;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.prevZ = ball.z;

  const speed = Math.hypot(owner.vx, owner.vy);
  // Charging a drag shot (F1.5a) or turning to shoot (F1.5b): the ball is glued to the blade.
  const charging = owner.shotHold >= 0 || owner.shotTurn > 0;
  const target = charging ? 0 : targetSeparation(owner, pressureOn(owner, players, tuning), tuning);
  // Separation changes smoothly (no pops), quicker to grow than to settle back.
  const rate = target > ball.separation ? 10 : 5;
  ball.separation += (target - ball.separation) * Math.min(1, rate * dt);

  // Touch rhythm: push the ball out by `separation` and catch it again, once per touchDistance.
  ball.touchPhase = (ball.touchPhase + (speed * dt) / Math.max(0.2, d.touchDistance)) % 1;
  // Touch push goes the way the skater travels (during a skid the body turns but the ball
  // keeps rolling on in the direction of travel).
  const push = owner.skidTime > 0 || owner.cutPrep > 0 || owner.cutTime > 0 ? ball.separation : ball.separation * 0.5 * (1 - Math.cos(ball.touchPhase * Math.PI * 2));
  const t = bladePoint(owner, tuning);
  const travel = speed > 0.5 ? Math.atan2(owner.vy, owner.vx) : owner.heading;
  t.x += Math.cos(travel) * push;
  t.y += Math.sin(travel) * push;

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
  if (!charging && excess > 0 && nextFloat(rng) < excess * d.lossRate * dt) {
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
  owner.noPickupTicks = Math.round(dribbleFor(owner, tuning).relockTime * tuning.sim.tickRate);
}

/**
 * Can the loose ball reach this player's stick right now? Distance from his blade (m), or −1
 * if not. Normally it must reach the blade (pickupRadius); the receiver of an aimed pass has a
 * bigger reception zone around his body (`reach`, m: stretching for it). Whether he controls
 * it is decided by the reception (src/sim/receive.ts).
 */
export function pickupDistance(ball: BallState, p: PlayerState, tuning: Tuning, reach = 0): number {
  const d = dribbleFor(p, tuning);
  if (ball.owner !== -1 || ball.inGoal !== 0 || p.noPickupTicks > 0) return -1;
  if (ball.z - RINK.ballRadius > d.pickupMaxHeight) return -1;
  const b = bladePoint(p, tuning);
  const blade = Math.hypot(ball.x - b.x, ball.y - b.y);
  const inZone = blade <= d.pickupRadius || (reach > 0 && Math.hypot(ball.x - p.x, ball.y - p.y) <= reach);
  return inZone ? blade : -1;
}

/**
 * F1.5e: can the receiver of a driven pass that comes in the air block it with his stick now?
 * Like pickupDistance, but for a ball above dribble.pickupMaxHeight up to receive.highMaxHeight
 * (and also within `bladeReach` m of his blade): its distance from his blade (m), or −1.
 */
export function highBallDistance(ball: BallState, p: PlayerState, tuning: Tuning, reach: number, bladeReach = 0): number {
  const d = dribbleFor(p, tuning);
  if (ball.owner !== -1 || ball.inGoal !== 0 || p.noPickupTicks > 0) return -1;
  const h = ball.z - RINK.ballRadius;
  if (h <= d.pickupMaxHeight || h > receiveFor(p, tuning).highMaxHeight) return -1;
  const b = bladePoint(p, tuning);
  const blade = Math.hypot(ball.x - b.x, ball.y - b.y);
  const inZone = blade <= Math.max(d.pickupRadius, bladeReach) || (reach > 0 && Math.hypot(ball.x - p.x, ball.y - p.y) <= reach);
  return inZone ? blade : -1;
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
  // PASE is queued on release (src/sim/pass.ts updatePassButton), not on the press.
  p.bufPass = Math.max(0, p.bufPass - 1);
  // TIRO is queued on release too (src/sim/shot.ts updateShotButton), only while carrying the ball.
  p.bufShoot = Math.max(0, p.bufShoot - 1);
  p.bufDribble = cmd.dribble ? ticks : Math.max(0, p.bufDribble - 1);
  if (p.noPickupTicks > 0) p.noPickupTicks--;
  if (p.firstTouchTicks > 0) p.firstTouchTicks--;
  if (p.shotSinceRelease < 1e6) p.shotSinceRelease++;
}
