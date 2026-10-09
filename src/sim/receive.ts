import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import type { BallEvent, BallState } from './ball';
import { pickUp } from './dribble';
import { dribbleFor, receiveFor, skatingFor } from './feel';
import type { PlayerState } from './player';
import { isCutting, isSkidding } from './player';
import { nextFloat, type RngState } from './rng';

// Reception (F1.4c, docs/03 §3). Each time a loose ball reaches a player's stick, one
// deterministic roll decides how well he controls it: clean, heavy touch (the ball stays off
// the stick and may get away), rebound (it bounces off the stick) or miss (it goes past). The
// difficulty grows with the ball's speed relative to him, where it comes from, its height and
// bounce, his own state (sprint, off balance) and how far he stretches; Control reduces it.

export const RECEIVE_CLEAN = 0;
export const RECEIVE_HEAVY = 1;
export const RECEIVE_REBOUND = 2;
export const RECEIVE_MISS = 3;
export type ReceiveOutcome = typeof RECEIVE_CLEAN | typeof RECEIVE_HEAVY | typeof RECEIVE_REBOUND | typeof RECEIVE_MISS;

/**
 * Difficulty of controlling the loose ball now (before randomness; 0 = trivial). `blade` is
 * the ball's distance from his blade (m). `high`: a driven pass taken in the air (F1.5e): its
 * speed counts from highEasySpeed, a flat highPenalty instead of the height of a ball coming to
 * a stick on the floor, and its vertical speed is its flight, not a bounce.
 */
export function receiveDifficulty(ball: BallState, p: PlayerState, tuning: Tuning, blade: number, high = false): number {
  const r = receiveFor(p, tuning);
  const d = dribbleFor(p, tuning);
  const k = skatingFor(p, tuning);
  const rvx = ball.vx - p.vx;
  const rvy = ball.vy - p.vy;
  const s = Math.hypot(rvx, rvy);
  const easy = high ? r.highEasySpeed : r.easySpeed;
  const speed = Math.max(0, (s - easy) / Math.max(0.1, r.hardSpeed - easy));
  // Where it comes from, relative to where he faces: 1 = from the front, −1 = from behind.
  // Only matters as much as the ball is fast (a slow ball from behind is still easy).
  const from = s > 1e-6 ? -(rvx * Math.cos(p.heading) + rvy * Math.sin(p.heading)) / s : 1;
  const behind = r.behindPenalty * ((1 - from) / 2) * Math.min(1, s / Math.max(0.1, r.easySpeed));
  const height = high ? r.highPenalty : r.heightPenalty * Math.min(1, Math.max(0, ball.z - RINK.ballRadius) / Math.max(0.01, d.pickupMaxHeight));
  const bounce = high ? 0 : r.bouncePenalty * Math.min(1, Math.abs(ball.vz) / Math.max(0.1, r.bounceSpeed));
  const pv = Math.hypot(p.vx, p.vy);
  const sprintFrom = k.maxSpeed + 0.05;
  const sprint = r.sprintPenalty * Math.min(1, Math.max(0, (pv - sprintFrom) / Math.max(0.1, k.sprintSpeed - sprintFrom)));
  const offBalance = isSkidding(p) || isCutting(p) ? r.offBalancePenalty : 0;
  const stretch = r.stretchPenalty * Math.min(1, Math.max(0, blade - d.pickupRadius) / Math.max(0.1, r.reach));
  const control = Math.min(1, Math.max(0, p.control / 99));
  return (speed + behind + height + bounce + sprint + offBalance + stretch) * (1 - r.controlAdvantage * control);
}

/** Outcome for a final difficulty (difficulty + randomness). */
export function receiveOutcome(e: number, tuning: Tuning, p: PlayerState): ReceiveOutcome {
  const r = receiveFor(p, tuning);
  if (e < r.heavyAt) return RECEIVE_CLEAN;
  if (e < r.reboundAt) return RECEIVE_HEAVY;
  if (e < r.missAt) return RECEIVE_REBOUND;
  return RECEIVE_MISS;
}

/**
 * Player `index` tries to control the loose ball at his stick (`blade` m from the blade):
 * one roll, then the outcome is applied (clean / heavy: he has it; rebound: it bounces off
 * his stick; miss: it goes past). After a rebound or a miss he can't touch it for lockTime,
 * so every approach gets a single roll. `high` (F1.5e): a driven pass that comes in the air,
 * above dribble.pickupMaxHeight (see dribble.ts highBallDistance): he takes it down with the
 * stick (receiveDifficulty with high = true); controlled, it is at his stick on the floor.
 */
export function receiveBall(ball: BallState, index: number, p: PlayerState, blade: number, tuning: Tuning, rng: RngState, events: BallEvent[], high = false): ReceiveOutcome {
  const r = receiveFor(p, tuning);
  const rvx = ball.vx - p.vx;
  const rvy = ball.vy - p.vy;
  const s = Math.hypot(rvx, rvy);
  let outcome: ReceiveOutcome;
  let e: number;
  if (s > r.maxRelSpeed) {
    outcome = RECEIVE_MISS;
    e = r.missAt;
  } else {
    e = receiveDifficulty(ball, p, tuning, blade, high) + (nextFloat(rng) - 0.5) * r.randomness;
    outcome = receiveOutcome(e, tuning, p);
  }
  if (outcome === RECEIVE_CLEAN || outcome === RECEIVE_HEAVY) {
    pickUp(ball, index, p);
    p.receivedBallAngle = Math.atan2(rvy, rvx);
    if (outcome === RECEIVE_HEAVY) ball.separation = Math.max(ball.separation, r.heavySeparation);
    p.holdTime = 0;
    p.firstTouchTicks = Math.round(r.firstTouchWindow * tuning.sim.tickRate);
    p.receiveDifficulty = Math.max(0, e);
    return outcome;
  }
  missOrRebound(ball, p, outcome, rvx, rvy, s, tuning, rng, events);
  return outcome;
}

/** A reception that failed: he can't touch it for lockTime; a rebound bounces back off the stick. */
function missOrRebound(ball: BallState, p: PlayerState, outcome: ReceiveOutcome, rvx: number, rvy: number, s: number, tuning: Tuning, rng: RngState, events: BallEvent[]): void {
  const r = receiveFor(p, tuning);
  p.noPickupTicks = Math.max(p.noPickupTicks, Math.round(r.lockTime * tuning.sim.tickRate));
  if (outcome === RECEIVE_REBOUND) {
    // Back off the stick (the way it came), slower, a bit to either side, popping up.
    const back = Math.atan2(-rvy, -rvx) + (nextFloat(rng) * 2 - 1) * r.reboundSpread;
    const keep = s * r.reboundKeep;
    ball.vx = p.vx + Math.cos(back) * keep;
    ball.vy = p.vy + Math.sin(back) * keep;
    ball.vz = Math.max(ball.vz, r.reboundLift);
    events.push({ type: 'player', strength: s, side: 0 });
  }
}
