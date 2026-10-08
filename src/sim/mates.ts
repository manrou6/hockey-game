import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import type { BallState } from './ball';
import type { PlayerCommand } from './commands';
import type { PlayerState } from './player';
import { dribbleFor, skatingFor } from './feel';
import { PASS_DRIVE, PASS_LOB } from './pass';

// Simple teammates for the F1.4 passing test bench (not the F2 team AI): they offer a
// passing line beside and ahead of the ball carrier, go to meet a pass coming to them, pick
// up slow loose balls near them and, when the control does not switch to the receiver, give
// the ball back to the controlled player after a short delay. They drive the same skating
// physics as the human through ordinary PlayerCommands, so everything stays deterministic.

/** Loose balls slower than this (m/s) are "rolling to a stop", not a pass. */
const PASS_MIN_SPEED = 2;
/** Below this ball speed a loose ball can be fetched. */
const FETCH_MAX_SPEED = 3;
/** Distance (m) at which a skater counts as arrived at its target. */
const ARRIVED = 0.3;
/** Tiny stick push used to turn on the spot without really skating (pivot). */
const TURN_ONLY = 0.06;
/** Keep support spots this far inside the boards / end zones (m). */
const SPOT_MARGIN_Y = 1.5;
const SPOT_MAX_X = RINK.length / 2 - 5;

export interface Approach {
  /** Closest distance between the ball's straight path and the point (m). */
  dist: number;
  /** When the ball gets there (s); ≤ 0 = it is moving away. */
  t: number;
}

/** Closest approach of a moving loose ball's (straight, horizontal) path to a point. */
export function ballApproach(ball: BallState, x: number, y: number, out: Approach): Approach | null {
  const v2 = ball.vx * ball.vx + ball.vy * ball.vy;
  if (ball.owner >= 0 || v2 < PASS_MIN_SPEED * PASS_MIN_SPEED) return null;
  const dx = x - ball.x;
  const dy = y - ball.y;
  out.t = (dx * ball.vx + dy * ball.vy) / v2;
  out.dist = Math.abs(dx * ball.vy - dy * ball.vx) / Math.sqrt(v2);
  return out;
}

const tmpA: Approach = { dist: 0, t: 0 };

/**
 * The team-0 player a moving loose ball is heading to (path passes within interceptRadius
 * before interceptMaxTime), or −1. Players who just let the ball go are skipped.
 */
export function findReceiver(players: readonly PlayerState[], ball: BallState, tuning: Tuning, exclude = -1): number {
  const m = tuning.mates;
  let best = -1;
  let bestDist = Infinity;
  let bestT = Infinity;
  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    if (i === exclude || p.team !== 0 || p.noPickupTicks > 0) continue;
    const a = ballApproach(ball, p.x, p.y, tmpA);
    if (!a || a.t <= 0 || a.t > m.interceptMaxTime || a.dist > m.interceptRadius) continue;
    if (a.dist < bestDist - 1e-9 || (Math.abs(a.dist - bestDist) <= 1e-9 && a.t < bestT)) {
      best = i;
      bestDist = a.dist;
      bestT = a.t;
    }
  }
  return best;
}

function setMove(out: PlayerCommand, angle: number, mag: number): void {
  out.moveX = Math.cos(angle) * mag;
  out.moveY = Math.sin(angle) * mag;
}

/** Skate towards (tx, ty) at up to `speed` (fraction of top speed), easing in on arrival. */
function moveTo(p: PlayerState, tx: number, ty: number, speed: number, arriveRadius: number, out: PlayerCommand): boolean {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= ARRIVED) {
    out.moveX = out.moveY = 0;
    return true;
  }
  setMove(out, Math.atan2(dy, dx), Math.max(0.15, speed * Math.min(1, d / Math.max(0.1, arriveRadius))));
  return false;
}

/** Skaters can't shuffle backwards: a short step away from the ball would turn his back to it. */
const NO_BACK_STEP = 1.5;

/**
 * Movement to meet a moving ball with the stick: go to where its path passes (offset so the
 * blade, which is to the right of the body, is on the line), then face it and wait. Short
 * sideways steps are fine (he turns back to the ball quickly); short steps backwards are not.
 *
 * With a meeting point (the receiver of an aimed pass, docs/03 §3) he heads for the point of
 * the ball's path nearest to it, at the speed he needs to be there in time (the pass led him
 * assuming he keeps moving, so he must not stop short).
 */
export function interceptMove(p: PlayerState, ball: BallState, tuning: Tuning, out: PlayerCommand, meetX = Number.NaN, meetY = Number.NaN): void {
  const m = tuning.mates;
  const meet = !Number.isNaN(meetX);
  const a = meet ? ballApproach(ball, meetX, meetY, tmpA) : ballApproach(ball, p.x, p.y, tmpA);
  if (!a) {
    out.moveX = out.moveY = 0;
    return;
  }
  const t = Math.max(0, a.t);
  const face = Math.atan2(-ball.vy, -ball.vx);
  const side = dribbleFor(p, tuning).stickSide;
  // Facing the ball, the blade is `side` to the right: (sin, −cos) of the facing angle.
  const bx = ball.x + ball.vx * t - Math.sin(face) * side;
  const by = ball.y + ball.vy * t + Math.cos(face) * side;
  const dx = bx - p.x;
  const dy = by - p.y;
  const d = Math.hypot(dx, dy);
  if (meet) {
    // Arrived, or the ball is about to arrive: face it and wait (never run into it).
    if (d <= m.settleRadius || a.t < m.settleTime / 2) setMove(out, face, TURN_ONLY);
    else {
      const needed = d / Math.max(0.15, t);
      setMove(out, Math.atan2(dy, dx), Math.min(m.interceptSpeed, Math.max(d > 1 ? 0.3 : 0.1, needed / skatingFor(p, tuning).maxSpeed)));
    }
    return;
  }
  const backwards = d < NO_BACK_STEP && (dx * Math.cos(face) + dy * Math.sin(face)) / Math.max(1e-6, d) < -0.5;
  if (d <= m.settleRadius || a.t < m.settleTime || backwards) setMove(out, face, TURN_ONLY);
  else moveTo(p, bx, by, m.interceptSpeed, 0.8, out);
}

/** Support spot for a teammate: beside and ahead (towards the attacked goal) of the anchor. */
function supportSpot(anchor: PlayerState, side: number, tuning: Tuning, out: { x: number; y: number }): void {
  const m = tuning.mates;
  const attack = anchor.team === 0 ? 1 : -1;
  out.x = Math.max(-SPOT_MAX_X, Math.min(SPOT_MAX_X, anchor.x + attack * m.supportAhead));
  const maxY = RINK.width / 2 - SPOT_MARGIN_Y;
  // The two spots stay supportSide either side of a centre line kept inside the boards, so
  // near a side board both slide across together instead of piling up on one spot.
  const half = Math.min(m.supportSide, maxY);
  const centre = Math.max(-maxY + half, Math.min(maxY - half, anchor.y));
  out.y = centre + side * half;
}

const spot = { x: 0, y: 0 };

export interface BotContext {
  players: readonly PlayerState[];
  ball: BallState;
  controlled: number;
  /** Who the moving loose ball is heading to (−1 = nobody). */
  receiver: number;
  /** Sim time (s), for each teammate's slow drift in rhythm and position. */
  time: number;
  meetX: number;
  meetY: number;
}

/** A settled supporter only moves again once his spot is this far away (m): no twitching. */
const RESTART_DISTANCE = 1.2;

/** Per-teammate variation in [-1, 1] that drifts slowly over time (deterministic). */
function drift(id: number, time: number, rate: number): number {
  return Math.sin(time * rate + id * 2.39996);
}

/** Command for a teammate the human is not controlling. */
export function botCommand(ctx: BotContext, i: number, tuning: Tuning, out: PlayerCommand): void {
  const m = tuning.mates;
  const { players, ball, controlled } = ctx;
  const p = players[i]!;
  const me = players[controlled];
  out.moveX = out.moveY = 0;
  out.sprint = out.pass = out.shoot = out.dribble = out.passHeld = out.shootHeld = out.switchPlayer = false;
  out.passHeight = out.shootHeight = 0;

  // With the ball (only when the control does not switch): turn to the controlled player and
  // give it back after returnDelay, the same kind of pass he received (the pass assist aims
  // and leads it).
  if (ball.owner === i) {
    if (!me) return;
    setMove(out, Math.atan2(me.y - p.y, me.x - p.x), TURN_ONLY);
    // A tap of PASE with the same height he received it (the assist gives the strength). If
    // you are on the move (a give-and-go: you passed and ran on) he gives it back at once.
    const onTheMove = m.quickReturn >= 0.5 && Math.hypot(me.vx, me.vy) >= m.quickReturnSpeed;
    if (p.holdTime >= (onTheMove ? m.quickReturnDelay : m.returnDelay)) {
      out.pass = true;
      out.passHeight = p.receivedKind === PASS_LOB ? 2 : p.receivedKind === PASS_DRIVE ? 1 : 0;
    }
    return;
  }
  // A pass (or loose ball) is coming to me: go and meet it.
  if (ctx.receiver === i) {
    interceptMove(p, ball, tuning, out, ctx.meetX, ctx.meetY);
    return;
  }
  // Slow loose ball near me, and nearer to me than to the controlled player: pick it up.
  if (m.move >= 0.5 && ball.owner < 0 && ball.inGoal === 0 && Math.hypot(ball.vx, ball.vy) < FETCH_MAX_SPEED) {
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    const dMe = me ? Math.hypot(ball.x - me.x, ball.y - me.y) : Infinity;
    if (d < m.fetchRadius && d < dMe && nearestBot(ctx, ball.x, ball.y) === i) {
      moveTo(p, ball.x, ball.y, m.supportSpeed, 0.5, out);
      return;
    }
  }
  if (m.move < 0.5) return;
  // Offer a passing line beside the ball carrier (or beside the controlled player).
  const anchor = ball.owner >= 0 && players[ball.owner]!.team === p.team ? players[ball.owner]! : me;
  if (!anchor || anchor === p) return;
  supportSpot(anchor, supportSide(ctx, i, anchor), tuning, spot);
  // Each teammate has his own rhythm and his spot wanders a little, so they don't mirror you.
  spot.x += m.spotVariation * drift(p.id, ctx.time, 0.31);
  spot.y += m.spotVariation * 0.6 * drift(p.id + 7, ctx.time, 0.23);
  const speed = m.supportSpeed * (1 + m.speedVariation * drift(p.id + 3, ctx.time, 0.17));
  const far = Math.hypot(spot.x - p.x, spot.y - p.y);
  if (p.botSettled && far < RESTART_DISTANCE) return;
  p.botSettled = moveTo(p, spot.x, spot.y, speed, m.arriveRadius, out);
}

/** The bot (not the controlled player) nearest to a point. */
function nearestBot(ctx: BotContext, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ctx.players.length; i++) {
    const p = ctx.players[i]!;
    if (i === ctx.controlled || !p.bot || p.team !== 0) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * Which side of the anchor this supporter takes (+1 / −1): supporters are ranked by how far
 * to the anchor's left they already are, so they don't cross each other.
 */
function supportSide(ctx: BotContext, i: number, anchor: PlayerState): number {
  const me = ctx.players[i]!;
  let rank = 0;
  let count = 0;
  for (let j = 0; j < ctx.players.length; j++) {
    const o = ctx.players[j]!;
    if (j === ctx.controlled || o === anchor || !o.bot || o.team !== me.team) continue;
    count++;
    if (j === i) continue;
    // Strictly more to the left (larger y), or level and lower index, ranks first.
    if (o.y - anchor.y > me.y - anchor.y || (o.y === me.y && j < i)) rank++;
  }
  if (count <= 1) return me.y >= anchor.y ? 1 : -1;
  return rank === 0 ? 1 : -1;
}
