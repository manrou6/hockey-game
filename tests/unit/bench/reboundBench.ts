import { goalLineX, RINK } from '../../../src/config/rink';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { createBall, stepBall, type BallEvent, type BallState } from '../../../src/sim/ball';
import { createRng } from '../../../src/sim/rng';
import { heightAt } from '../../../src/sim/shot';

// Rebound bench (F1.5c): balls launched at the +x goal and the boards around it at up to
// 28 m/s, ball physics only (no players). Where do the rebounds go? Deterministic. Run with
//   PATINS_BENCH=1 npx vitest run tests/unit/bench/rebound
// Not part of the normal test run (see reboundBench.test.ts).

const TICK = 1 / 60;
const GX = goalLineX(1);
const R = RINK.ballRadius;
const HW = RINK.goalWidth / 2;
const PR = RINK.goalPostDiameter / 2;

export type Target = 'post' | 'bar' | 'sideNet' | 'topNet' | 'endBoards' | 'corner';

export interface ReboundCase {
  target: Target;
  /** Launch speed (m/s). */
  speed: number;
  /** Where the ball comes from: distance (m) from the point it aims at and angle off the goal axis (deg, towards +y). */
  dist: number;
  angle: number;
}

export interface ReboundStats {
  n: number;
  /** % that hit what they aim at first (post / bar / net / boards). */
  hit: number;
  /** Outcomes 0.5 s after the first impact (or where it stops before): % goal, % in play in front of the goal line, % behind it, % out of the rink. */
  goal: number;
  front: number;
  behind: number;
  out: number;
  /** Of those in front of the goal line then: % within 4 m of the centre of the goal (the slot), 4-8 m, further. */
  slot: number;
  mid: number;
  far: number;
  /** Mean speed right after the first impact (m/s) and as a % of the launch speed. */
  reboundSpeed: number;
  keep: number;
  /** Mean direction of the rebound (circular mean, deg: 180 = straight back out along the goal axis, +90 = towards +y). */
  reboundDir: number;
  /** Mean distance (m) from the centre of the goal 1 s after the impact, of those in play; and the launch speed (m/s). */
  distAfter1s: number;
  launchSpeed: number;
  /** Balls found inside the cage without having gone in through the mouth (tunnelling: must be 0). */
  tunnel: number;
}

/** Launch of a ball from (x, y) to cross the vertical of (tx, ty) at height tz, at `speed`. */
function launch(b: BallState, x: number, y: number, tx: number, ty: number, tz: number, speed: number, tuning: Tuning): void {
  const d = Math.hypot(tx - x, ty - y);
  const dir = Math.atan2(ty - y, tx - x);
  // The lowest elevation that is at height tz after d metres (bisection on the drag ballistics).
  let e = 0;
  if (tz > R + 0.005) {
    let lo = 0;
    let hi = 0.9;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (heightAt(speed, mid, d, tuning.ball) < tz) lo = mid;
      else hi = mid;
    }
    e = hi;
  }
  b.x = b.prevX = x;
  b.y = b.prevY = y;
  b.z = b.prevZ = R;
  b.vx = Math.cos(dir) * Math.cos(e) * speed;
  b.vy = Math.sin(dir) * Math.cos(e) * speed;
  b.vz = Math.sin(e) * speed;
  b.owner = -1;
}

/** A lob dropping on (tx, ty, tz) at a fixed steep elevation: the speed is what makes it get there. */
function launchLob(b: BallState, x: number, y: number, tx: number, ty: number, tz: number, tuning: Tuning): number {
  const d = Math.hypot(tx - x, ty - y);
  const dir = Math.atan2(ty - y, tx - x);
  const e = 1.0;
  let lo = 2;
  let hi = 25;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (heightAt(mid, e, d, tuning.ball) < tz) lo = mid;
    else hi = mid;
  }
  b.x = b.prevX = x;
  b.y = b.prevY = y;
  b.z = b.prevZ = R;
  b.vx = Math.cos(dir) * Math.cos(e) * hi;
  b.vy = Math.sin(dir) * Math.cos(e) * hi;
  b.vz = Math.sin(e) * hi;
  b.owner = -1;
  return hi;
}

/** The point each target is aimed at (with offset u in −1..1 across it) and the height. */
function aimPoint(c: ReboundCase, u: number): { x: number; y: number; z: number } {
  switch (c.target) {
    case 'post':
      // Across the near post (+y): from 2 radii inside to 2 radii outside its centre, low.
      return { x: GX + PR, y: HW + PR + u * (PR + R), z: R };
    case 'bar':
      // Across the crossbar: from just under it to just over it, middle third of the goal.
      return { x: GX + PR, y: u * 0.3, z: RINK.goalHeight + PR + u * (PR + R) };
    case 'sideNet':
      // The side of the cage (from a closed angle), along its depth, low to mid height.
      return { x: GX + 0.15 + (u + 1) * 0.35, y: HW + PR, z: 0.2 + (u + 1) * 0.25 };
    case 'topNet':
      // On the roof of the cage (a lob dropping on it).
      return { x: GX + 0.2 + (u + 1) * 0.2, y: u * 0.6, z: RINK.goalHeight + 0.05 };
    case 'endBoards':
      // Wide of the goal into the end boards behind it (1 to 4 m off the axis).
      return { x: RINK.length / 2 - R, y: 1.6 + (u + 1) * 1.4, z: R };
    case 'corner':
      // Into the rounded corner (+x, +y).
      return { x: RINK.length / 2 - RINK.cornerRadius * (0.5 - 0.4 * u), y: RINK.width / 2 - RINK.cornerRadius * (0.5 + 0.4 * u), z: R };
  }
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);

export function runRebound(tuning: Tuning, c: ReboundCase, n = 41): ReboundStats {
  const st: ReboundStats = { n, hit: 0, goal: 0, front: 0, behind: 0, out: 0, slot: 0, mid: 0, far: 0, reboundSpeed: Number.NaN, keep: Number.NaN, reboundDir: Number.NaN, distAfter1s: Number.NaN, launchSpeed: c.speed, tunnel: 0 };
  const launches: number[] = [];
  const speeds: number[] = [];
  const dirs: number[] = [];
  const after: number[] = [];
  let backInFront = 0;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? -1 + (2 * i) / (n - 1) : 0;
    const t = aimPoint(c, u);
    const th = (c.angle * Math.PI) / 180;
    const sx = t.x - c.dist * Math.cos(th);
    const sy = t.y + c.dist * Math.sin(th);
    const b = createBall(sx, sy);
    if (c.target === 'topNet') launches.push(launchLob(b, sx, sy, t.x, t.y, t.z, tuning));
    else {
      launch(b, sx, sy, t.x, t.y, t.z, c.speed, tuning);
      launches.push(c.speed);
    }
    const rng = createRng(1000 + i);
    const events: BallEvent[] = [];
    let impact = -1;
    let first: BallEvent['type'] | '' = '';
    let tunnelled = false;
    let at: { x: number; y: number } | null = null;
    for (let tick = 0; tick < 6 * 60; tick++) {
      events.length = 0;
      stepBall(b, [], tuning, rng, TICK, events);
      for (const e of events) {
        if (impact < 0 && (e.type === 'post' || e.type === 'net' || e.type === 'board')) {
          impact = tick;
          first = e.type;
          speeds.push(Math.hypot(b.vx, b.vy, b.vz));
          dirs.push((Math.atan2(b.vy, b.vx) * 180) / Math.PI);
        }
      }
      const inside = b.x > GX + R && b.x < GX + RINK.goalDepthBottom && Math.abs(b.y) < HW && b.z < RINK.goalHeight;
      if (inside && b.inGoal === 0) tunnelled = true;
      const stopped = Math.hypot(b.vx, b.vy, b.vz) < 0.3 && b.z <= R + 1e-3 && tick > 10;
      if (impact >= 0 && !at && (tick === impact + 30 || stopped) && !b.out && b.inGoal === 0) at = { x: b.x, y: b.y };
      if (impact >= 0 && (tick === impact + 60 || (stopped && tick < impact + 60)) && !b.out && b.inGoal === 0) after.push(Math.hypot(GX - b.x, b.y));
      if (b.out || b.scored || b.inGoal !== 0 || tick >= impact + 60 && impact >= 0) break;
      if (stopped) break;
    }
    const wanted = c.target === 'post' || c.target === 'bar' ? 'post' : c.target === 'sideNet' || c.target === 'topNet' ? 'net' : 'board';
    if (first === wanted) st.hit++;
    if (tunnelled) st.tunnel++;
    const pos = at ?? { x: b.x, y: b.y };
    if (b.scored || b.inGoal !== 0) st.goal++;
    else if (b.out) st.out++;
    else if (pos.x > GX) st.behind++;
    else {
      st.front++;
      backInFront++;
      const d = Math.hypot(GX - pos.x, pos.y);
      if (d <= 4) st.slot++;
      else if (d <= 8) st.mid++;
      else st.far++;
    }
  }
  const pct = (x: number): number => (100 * x) / n;
  st.hit = pct(st.hit);
  st.goal = pct(st.goal);
  st.front = pct(st.front);
  st.behind = pct(st.behind);
  st.out = pct(st.out);
  const inFront = (x: number): number => (backInFront ? (100 * x) / backInFront : Number.NaN);
  st.slot = inFront(st.slot);
  st.mid = inFront(st.mid);
  st.far = inFront(st.far);
  st.reboundSpeed = mean(speeds);
  st.reboundDir = (Math.atan2(mean(dirs.map((d) => Math.sin((d * Math.PI) / 180))), mean(dirs.map((d) => Math.cos((d * Math.PI) / 180)))) * 180) / Math.PI;
  st.distAfter1s = mean(after);
  st.launchSpeed = mean(launches);
  st.keep = (100 * st.reboundSpeed) / st.launchSpeed;
  return st;
}

export function fmtRebound(s: ReboundStats): string {
  const f = (x: number, w = 3): string => (Number.isNaN(x) ? '  -' : x.toFixed(0).padStart(w));
  return `hit ${f(s.hit)}% | 0.5 s later: goal ${f(s.goal)}% front ${f(s.front)}% behind ${f(s.behind)}% out ${f(s.out)}% | of the front: slot ${f(s.slot)}% 4-8 m ${f(s.mid)}% far ${f(s.far)}% | rebound ${s.reboundSpeed.toFixed(1).padStart(4)} m/s (${f(s.keep)}%) dir ${f(s.reboundDir, 4)}° | 1 s later ${Number.isNaN(s.distAfter1s) ? '  -' : s.distAfter1s.toFixed(1)} m | tunnel ${s.tunnel}`;
}

export const BASE = (): Tuning => structuredClone(TUNING);
export const HEAVY = (): Tuning => {
  const t = BASE();
  t.ball.heavy = 1;
  return t;
};
