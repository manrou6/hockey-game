import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { ballParams, type BallState } from './ball';
import { dribbleFor, skatingFor, wallFor } from './feel';
import type { PlayerState } from './player';
import { wrapAngle } from './player';
import { BISECT_STEPS, roll, type RollResult } from './rolling';

// Wall pass ("pared con la valla", F1.4d, docs/03 §3): a low pass against a side board that
// comes back to where the passer will be. With the assist on, when the aimed direction is
// close to the one that makes the ball come back to him (continuing at his current velocity),
// the direction is corrected towards it and the strength is worked out so it arrives at his
// stick at a controllable speed. It is only worked out at the release: afterwards the ball
// is plain physics (board bounce included, with its small random deflection).

/** What the planner decided (all in sim coordinates). */
export interface WallPlan {
  /** Direction of the first leg (rad) and launch speed (m/s). */
  angle: number;
  speed: number;
  /** Where the ball will hit the board, and where the passer will meet it again. */
  wallX: number;
  wallY: number;
  meetX: number;
  meetY: number;
}

export function createWallPlan(): WallPlan {
  return { angle: 0, speed: 0, wallX: 0, wallY: 0, meetX: 0, meetY: 0 };
}

const rollA: RollResult = { speed: 0, time: 0 };
const rollB: RollResult = { speed: 0, time: 0 };

/** Keep the meeting point this far inside the boards (m). */
const MEET_MARGIN = 1;
/** The contact point must be this far from the corner arcs (m). */
const CORNER_MARGIN = 0.5;
/** Passes shorter than this (m) to the board are not a wall pass. */
const MIN_FIRST_LEG = 1;
/** Refinements of the meeting point (the flight time depends on it). */
const ITERATIONS = 4;

/**
 * Plan a wall pass for the passer `p` (carrying `ball`) aiming at `aim` (rad); `sprinting` = he is
 * pushing the sprint (he will keep speeding up once the ball has left). Returns false if
 * the aim is not close enough to a wall pass (then the pass simply goes where it is aimed).
 * `cone` is how far (rad) the aim may be from the ideal direction, `correction` (0..1) how
 * much of the way the direction is corrected towards it; `groundMin/Max` bound the launch speed.
 */
export function planWallPass(
  p: PlayerState,
  ball: BallState,
  aim: number,
  sprinting: boolean,
  cone: number,
  correction: number,
  groundMin: number,
  groundMax: number,
  tuning: Tuning,
  out: WallPlan,
): boolean {
  const w = wallFor(p, tuning);
  const k = ballParams(tuning);
  if (w.assist < 0.5 || cone <= 0) return false;
  // The side board the stick points at (the long boards only; the ends have goals and corners).
  const sy = Math.sin(aim) >= 0 ? 1 : -1;
  const yb = sy * (RINK.width / 2 - RINK.ballRadius);
  const bx = ball.x;
  const by = ball.y;
  if ((yb - by) * sy < MIN_FIRST_LEG * 0.3) return false;
  const speed = Math.hypot(p.vx, p.vy);
  // Where he will be: continuing at his velocity (standing: a little ahead of where he faces).
  const dirX = speed >= w.minSpeed ? p.vx / speed : Math.cos(p.heading);
  const dirY = speed >= w.minSpeed ? p.vy / speed : Math.sin(p.heading);
  const maxY = RINK.width / 2 - MEET_MARGIN;
  const maxX = RINK.length / 2 - MEET_MARGIN - 1;
  // Boards: the normal part of the speed is kept `e`, the tangential one (1 − friction).
  const e = k.boardRestitution;
  const a = 1 - k.boardFriction;
  const xLimit = RINK.length / 2 - RINK.cornerRadius - CORNER_MARGIN;

  // He is expected to keep skating the way he goes, speeding up towards his normal top speed
  // (or keeping a sprint): v(t) = vc − (vc − v0)·e^(−t/τ), τ = vc / accel.
  const sk = skatingFor(p, tuning);
  const vc = Math.max(sprinting ? sk.maxSpeed + (sk.sprintSpeed - sk.maxSpeed) * w.sprintGain : sk.maxSpeed, speed);
  const tau = vc / Math.max(0.1, sk.accel);
  const travelled = (time: number): number => vc * time - (vc - speed) * tau * (1 - Math.exp(-time / tau));
  // The ball should arrive at his blade (ahead of his body, to the right), not at his centre.
  const d = dribbleFor(p, tuning);
  const bladeX = dirX * d.stickForward + dirY * d.stickSide;
  const bladeY = dirY * d.stickForward - dirX * d.stickSide;

  let t = 1;
  let mx = p.x;
  let my = p.y;
  let xc = bx;
  let s = groundMin;
  for (let it = 0; it < ITERATIONS; it++) {
    const ahead = speed >= w.minSpeed ? travelled(t) * w.lead : w.standingAhead;
    mx = Math.max(-maxX, Math.min(maxX, p.x + dirX * ahead + bladeX));
    my = Math.max(-maxY, Math.min(maxY, p.y + dirY * ahead + bladeY));
    // Contact point: the ball leaves the board towards M with the bounce's own geometry.
    const dn = (yb - by) * sy; // distance to the board along its normal (> 0)
    const dm = (yb - my) * sy; // M's distance to the board (≥ 0)
    // (mx − xc) · e · dn = a · dm · (xc − bx)   →   xc = (e·dn·mx + a·dm·bx) / (e·dn + a·dm)
    xc = (e * dn * mx + a * dm * bx) / (e * dn + a * dm);
    const l1 = Math.hypot(xc - bx, yb - by);
    const l2 = Math.hypot(mx - xc, my - yb);
    if (l1 < MIN_FIRST_LEG || l1 > w.maxDistance) return false;
    // Launch speed so that it arrives at M at the wall pass arrival speed (bisection).
    let lo = groundMin;
    let hi = groundMax;
    const arrival = (v0: number): number => {
      const r1 = roll(v0, l1, k, rollA);
      if (r1.speed <= 0) return 0;
      const ux = Math.abs(xc - bx) / l1;
      const uy = Math.abs(yb - by) / l1;
      const v2 = Math.hypot(a * r1.speed * ux, e * r1.speed * uy);
      return roll(v2, l2, k, rollB).speed;
    };
    if (arrival(hi) <= w.arrivalSpeed) s = hi;
    else if (arrival(lo) >= w.arrivalSpeed) s = lo;
    else {
      for (let i = 0; i < BISECT_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (arrival(mid) < w.arrivalSpeed) lo = mid;
        else hi = mid;
      }
      s = hi;
    }
    // Total travel time: first leg + second leg (second leg speed from the bounce).
    const r1 = roll(s, l1, k, rollA);
    const t1 = Number.isFinite(r1.time) ? r1.time : l1 / s;
    const ux = Math.abs(xc - bx) / l1;
    const uy = Math.abs(yb - by) / l1;
    const v2 = Math.hypot(a * r1.speed * ux, e * r1.speed * uy);
    const r2 = roll(Math.max(0.5, v2), l2, k, rollB);
    const t2 = Number.isFinite(r2.time) ? r2.time : l2 / Math.max(0.5, v2);
    t = t1 + t2;
  }
  if (Math.abs(xc) > xLimit) return false;
  const ideal = Math.atan2(yb - by, xc - bx);
  const off = wrapAngle(aim - ideal);
  if (Math.abs(off) > cone) return false;
  out.angle = ideal + (1 - correction) * off;
  out.speed = s;
  out.wallX = xc;
  out.wallY = yb;
  out.meetX = mx;
  out.meetY = my;
  return true;
}
