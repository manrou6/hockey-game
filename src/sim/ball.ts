import { goalLineX, RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { PLAYER_HEIGHT, type PlayerState } from './player';
import { boardSignedDistance } from './rink';
import { nextRange, type RngState } from './rng';
import { skatingFor } from './feel';

/** m/s². A physical constant, not game feel. */
export const GRAVITY = 9.81;
/**
 * Continuous collision: each tick is split into sub-steps so the ball never moves more
 * than ~90% of its radius per sub-step. At 30 m/s that is ~15 sub-steps, so it can't
 * tunnel through a 7.6 cm post or the boards.
 */
const MAX_SUBSTEP_MOVE = RINK.ballRadius * 0.9;
const MAX_SUBSTEPS = 24;
/** Impacts slower than this (m/s) don't produce events (rolling contact, resting). */
const EVENT_MIN_SPEED = 0.6;
/** Vertical speed below which a floor contact stops bouncing and starts rolling. */
const MIN_BOUNCE_SPEED = 0.35;

export type BallEventType = 'board' | 'post' | 'net' | 'floor' | 'player' | 'goal' | 'out';

/** Something the ball hit this tick (for sound, vibration and game rules). */
export interface BallEvent {
  type: BallEventType;
  /** Impact speed along the contact normal (m/s); 0 for goal/out. */
  strength: number;
  /** Goal side (-1 left goal, +1 right goal) for 'goal'/'net'/'post'. */
  side: -1 | 0 | 1;
}

export interface BallState {
  /** Centre position: x along length, y along width, z height above the floor (m). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  /** Goal the ball is inside (−1 / +1), 0 if none. */
  inGoal: -1 | 0 | 1;
  /** True once the whole ball crossed the goal line (goal counted). */
  scored: boolean;
  /** Went over the boards this tick. */
  out: boolean;
  /** Index of the player carrying the ball on the stick, −1 if loose. */
  owner: number;
  /** Dribble touch rhythm 0..1 (advances with distance skated). */
  touchPhase: number;
  /** Current dribble separation from the blade (m), smoothed. */
  separation: number;
  /**
   * Guided flight of the driven lofted pass ("alt fort", docs/03 §3): while `guide` is on, the
   * ball follows a shaped path from (gx, gy) along (gdx, gdy) at gSpeed: it rises at gTanUp,
   * flies flat at gH and drops at gTanDown to land gDist metres away (gS = distance done).
   * Hitting anything (boards, a player, the goal area) hands it back to free physics.
   */
  guide: boolean;
  gx: number;
  gy: number;
  gdx: number;
  gdy: number;
  gDist: number;
  gS: number;
  gSpeed: number;
  gH: number;
  gTanUp: number;
  gTanDown: number;
}

export function createBall(x: number, y: number): BallState {
  const r = RINK.ballRadius;
  return {
    x, y, z: r, vx: 0, vy: 0, vz: 0, prevX: x, prevY: y, prevZ: r,
    inGoal: 0, scored: false, out: false, owner: -1, touchPhase: 0, separation: 0,
    guide: false, gx: 0, gy: 0, gdx: 1, gdy: 0, gDist: 0, gS: 0, gSpeed: 0, gH: 0, gTanUp: 0, gTanDown: 0,
  };
}

/** Put the ball at rest at (x, y). */
export function placeBall(b: BallState, x: number, y: number): void {
  const r = RINK.ballRadius;
  b.x = b.prevX = x;
  b.y = b.prevY = y;
  b.z = b.prevZ = r;
  b.vx = b.vy = b.vz = 0;
  b.inGoal = 0;
  b.scored = false;
  b.out = false;
  b.owner = -1;
  b.separation = 0;
  b.guide = false;
}

/** Corner rounding of the guided flight profile (m): no sharp kinks in the path. */
const GUIDE_CORNER = 0.15;

/** Smooth minimum (polynomial), rounding the corner over `k`. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** Height above the floor (of the ball's bottom) at distance s along a guided flight. */
export function guidedHeight(b: BallState, s: number): number {
  const up = s * b.gTanUp;
  const down = (b.gDist - s) * b.gTanDown;
  return Math.max(0, smin(smin(up, b.gH, GUIDE_CORNER), down, GUIDE_CORNER));
}

/**
 * Start a guided "driven lofted" flight from the ball's position: direction `angle`,
 * horizontal speed, landing `dist` metres away, rising at `launch` and dropping at `fall`
 * (rad), never higher than maxHeight (lower if the pass is too short to reach it).
 */
export function startGuidedFlight(b: BallState, angle: number, speed: number, dist: number, launch: number, maxHeight: number, fall: number): void {
  b.guide = true;
  b.gx = b.x;
  b.gy = b.y;
  b.gdx = Math.cos(angle);
  b.gdy = Math.sin(angle);
  b.gDist = Math.max(0.5, dist);
  b.gS = 0;
  b.gSpeed = Math.max(1, speed);
  b.gTanUp = Math.tan(Math.min(1.5, Math.max(0.05, launch)));
  b.gTanDown = Math.tan(Math.min(1.5, Math.max(0.05, fall)));
  b.gH = Math.max(0, Math.min(maxHeight, b.gDist / (1 / b.gTanUp + 1 / b.gTanDown)));
  b.vx = b.gdx * b.gSpeed;
  b.vy = b.gdy * b.gSpeed;
  b.vz = 0;
  b.z = RINK.ballRadius;
}

/**
 * One tick of guided flight. Once it lands or is about to touch something the guide is
 * switched off, leaving a velocity that continues the path.
 */
function guidedStep(b: BallState, players: readonly PlayerState[], tuning: Tuning, dt: number): void {
  const r = RINK.ballRadius;
  const z0 = b.z;
  b.gS = Math.min(b.gDist, b.gS + b.gSpeed * dt);
  b.x = b.gx + b.gdx * b.gS;
  b.y = b.gy + b.gdy * b.gS;
  b.z = r + guidedHeight(b, b.gS);
  b.vx = b.gdx * b.gSpeed;
  b.vy = b.gdy * b.gSpeed;
  b.vz = (b.z - z0) / dt;
  if (b.gS >= b.gDist) {
    // Touchdown: from here it's a real ball. It comes down steeply, but with a believable
    // vertical speed (never more than a free fall from its peak) so the bounce stays low.
    b.guide = false;
    b.z = r + 1e-3;
    b.vz = -Math.min(b.gSpeed * b.gTanDown, Math.sqrt(2 * GRAVITY * Math.max(0.05, b.gH)));
    return;
  }
  // About to hit the boards, a player or the goal: hand over to the physics (it bounces).
  let blocked = boardSignedDistance(b.x, b.y, normal) + r > -0.05 || Math.abs(b.x) > goalLineX(1) - 0.3;
  if (!blocked && b.z <= PLAYER_HEIGHT) {
    for (const p of players) {
      const min = skatingFor(p, tuning).radius + r;
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < min * min) {
        blocked = true;
        break;
      }
    }
  }
  if (blocked) b.guide = false;
}

const normal = { nx: 0, ny: 0 };

function emit(events: BallEvent[], type: BallEventType, strength: number, side: -1 | 0 | 1 = 0): void {
  if (type === 'goal' || type === 'out' || strength >= EVENT_MIN_SPEED) events.push({ type, strength, side });
}

/** Advance the ball one fixed tick (with sub-steps). Collision events are appended to `events`. */
export function stepBall(b: BallState, players: readonly PlayerState[], tuning: Tuning, rng: RngState, dt: number, events: BallEvent[]): void {
  b.prevX = b.x;
  b.prevY = b.y;
  b.prevZ = b.z;
  b.out = false;
  // Guided flight moves the ball this tick; once it lands or touches something, the free
  // physics takes over from the next tick.
  if (b.guide) {
    guidedStep(b, players, tuning, dt);
    return;
  }
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP_MOVE)));
  const h = dt / n;
  for (let i = 0; i < n && !b.out; i++) substep(b, players, tuning, rng, h, events);
}

function substep(b: BallState, players: readonly PlayerState[], tuning: Tuning, rng: RngState, h: number, events: BallEvent[]): void {
  const k = tuning.ball;
  const r = RINK.ballRadius;
  const onFloor = b.z <= r + 1e-4 && b.vz <= 1e-3;

  // --- Forces -------------------------------------------------------------------------
  if (onFloor) {
    b.vz = 0;
    b.z = r;
    // Rolling resistance (constant + proportional).
    const hs = Math.hypot(b.vx, b.vy);
    if (hs > 0) {
      const ns = Math.max(0, hs - (k.rollingDecel + k.rollingDrag * hs) * h);
      b.vx *= ns / hs;
      b.vy *= ns / hs;
    }
  } else {
    b.vz -= GRAVITY * h;
  }
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  if (sp > 0) {
    const s = Math.max(0, 1 - k.airDrag * sp * h);
    b.vx *= s;
    b.vy *= s;
    b.vz *= s;
  }

  // --- Integrate ----------------------------------------------------------------------
  const prevX = b.x;
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;

  // --- Floor --------------------------------------------------------------------------
  if (b.z < r) {
    b.z = r;
    if (b.vz < 0) {
      const impact = -b.vz;
      if (impact > MIN_BOUNCE_SPEED) {
        b.vz = impact * k.floorRestitution;
        const f = 1 - k.floorFriction;
        b.vx *= f;
        b.vy *= f;
        emit(events, 'floor', impact);
      } else {
        b.vz = 0;
      }
    }
  }

  // --- Goals (posts, crossbar, net, goal line) ------------------------------------------
  for (const side of [-1, 1] as const) collideGoal(b, side, prevX, tuning, h, events);
  if (b.inGoal !== 0) return; // inside the net: nothing else to hit

  // --- Boards ---------------------------------------------------------------------------
  const sd = boardSignedDistance(b.x, b.y, normal);
  if (sd + r > 0) {
    if (b.z < RINK.boardHeight + r * 0.5) {
      // Push back inside and bounce (normal points out of the rink).
      b.x -= normal.nx * (sd + r);
      b.y -= normal.ny * (sd + r);
      const vn = b.vx * normal.nx + b.vy * normal.ny;
      if (vn > 0) {
        const tx = (b.vx - vn * normal.nx) * (1 - k.boardFriction);
        const ty = (b.vy - vn * normal.ny) * (1 - k.boardFriction);
        let vx = tx - k.boardRestitution * vn * normal.nx;
        let vy = ty - k.boardRestitution * vn * normal.ny;
        // Small deterministic deflection: real boards are never perfectly flat.
        const a = nextRange(rng, -k.boardJitter, k.boardJitter);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const rx = vx * c - vy * s;
        const ry = vx * s + vy * c;
        if (rx * normal.nx + ry * normal.ny < 0) {
          vx = rx;
          vy = ry;
        }
        b.vx = vx;
        b.vy = vy;
        emit(events, 'board', vn);
      }
    } else if (sd > 0) {
      // Flew over the boards.
      b.out = true;
      emit(events, 'out', 0);
      return;
    }
  }

  // --- Players' bodies ------------------------------------------------------------------
  for (const p of players) {
    // Whoever just played the ball (pass/shot) doesn't run into it: at a sprint a sideways
    // pass would otherwise hit his own body.
    if (b.z > PLAYER_HEIGHT || p.noPickupTicks > 0) continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const min = skatingFor(p, tuning).radius + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    const nx = d > 1e-6 ? dx / d : Math.cos(p.heading);
    const ny = d > 1e-6 ? dy / d : Math.sin(p.heading);
    b.x = p.x + nx * min;
    b.y = p.y + ny * min;
    const rvn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
    if (rvn < 0) {
      b.vx -= (1 + k.playerRestitution) * rvn * nx;
      b.vy -= (1 + k.playerRestitution) * rvn * ny;
      emit(events, 'player', -rvn);
    }
  }
}

/** Sphere vs capsule segment (a→b, radius rad). Bounces the ball off it. Returns impact speed or 0. */
function collideSegment(
  b: BallState,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  rad: number,
  restitution: number,
): number {
  const r = RINK.ballRadius;
  const sx = bx - ax;
  const sy = by - ay;
  const sz = bz - az;
  const len2 = sx * sx + sy * sy + sz * sz;
  let t = len2 > 0 ? ((b.x - ax) * sx + (b.y - ay) * sy + (b.z - az) * sz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + sx * t;
  const cy = ay + sy * t;
  const cz = az + sz * t;
  const dx = b.x - cx;
  const dy = b.y - cy;
  const dz = b.z - cz;
  const min = r + rad;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const nz = dz / d;
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  b.z = Math.max(r, cz + nz * min);
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return 0;
  b.vx -= (1 + restitution) * vn * nx;
  b.vy -= (1 + restitution) * vn * ny;
  b.vz -= (1 + restitution) * vn * nz;
  return -vn;
}

function collideGoal(b: BallState, side: -1 | 1, prevX: number, tuning: Tuning, h: number, events: BallEvent[]): void {
  const k = tuning.ball;
  const r = RINK.ballRadius;
  const gx = goalLineX(side);
  const hw = RINK.goalWidth / 2;
  const H = RINK.goalHeight;
  const D = RINK.goalDepthBottom;
  const pr = RINK.goalPostDiameter / 2;
  // Depth behind the goal line (positive = inside / behind the goal).
  const u = side * (b.x - gx);
  const prevU = side * (prevX - gx);

  if (b.inGoal === side) {
    // Inside the cage: the net contains the ball and soaks up its speed.
    const damp = Math.max(0, 1 - k.netDamping * h);
    b.vx *= damp;
    b.vy *= damp;
    b.vz *= damp;
    const clampAxis = (val: number, lo: number, hi: number, vel: 'vx' | 'vy' | 'vz', sign: number): number => {
      if (val < lo) {
        if (b[vel] * sign < 0) b[vel] = -b[vel] * k.netRestitution;
        return lo;
      }
      if (val > hi) {
        if (b[vel] * sign > 0) b[vel] = -b[vel] * k.netRestitution;
        return hi;
      }
      return val;
    };
    const uu = clampAxis(u, r, D - r, 'vx', side);
    b.x = gx + side * uu;
    b.y = clampAxis(b.y, -hw + r, hw - r, 'vy', 1);
    b.z = clampAxis(b.z, r, H - r, 'vz', 1);
    if (!b.scored && uu >= r) {
      b.scored = true;
      emit(events, 'goal', 0, side);
    }
    return;
  }

  // Crossing the goal line through the mouth → the ball is in the goal.
  if (prevU <= 0 && u > 0 && Math.abs(b.y) < hw && b.z < H) {
    b.inGoal = side;
    return;
  }

  // Frame: two posts and the crossbar (capsules).
  const fx = gx + side * pr;
  const top = H + pr;
  const hit =
    collideSegment(b, fx, -hw - pr, 0, fx, -hw - pr, top, pr, k.postRestitution) +
    collideSegment(b, fx, hw + pr, 0, fx, hw + pr, top, pr, k.postRestitution) +
    collideSegment(b, fx, -hw - pr, top, fx, hw + pr, top, pr, k.postRestitution);
  if (hit > 0) emit(events, 'post', hit, side);

  // Outside of the cage (from the sides, behind or above): a solid box covered by net.
  if (side * (b.x - gx) > -r) {
    const minX = Math.min(gx, gx + side * (D + pr));
    const maxX = Math.max(gx, gx + side * (D + pr));
    const cx = Math.min(Math.max(b.x, minX), maxX);
    const cy = Math.min(Math.max(b.y, -hw - pr), hw + pr);
    const cz = Math.min(Math.max(b.z, 0), top);
    const dx = b.x - cx;
    const dy = b.y - cy;
    const dz = b.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    // Only when the ball is not lined up with the open mouth from the front.
    const inMouth = u <= r && Math.abs(b.y) < hw && b.z < H;
    if (!inMouth && d2 < r * r) {
      let nx: number;
      let ny: number;
      let nz: number;
      let d = Math.sqrt(d2);
      if (d > 1e-6) {
        nx = dx / d;
        ny = dy / d;
        nz = dz / d;
      } else {
        // Centre inside the box (fast ball): push out through the nearest side face.
        const toSide = hw + pr - Math.abs(b.y);
        const toBack = side * (gx + side * (D + pr) - b.x);
        const toTop = top - b.z;
        const m = Math.min(toSide, toBack, toTop);
        nx = m === toBack ? side : 0;
        ny = m === toSide ? (b.y < 0 ? -1 : 1) : 0;
        nz = m === toTop ? 1 : 0;
        d = -m;
      }
      b.x += nx * (r - d);
      b.y += ny * (r - d);
      b.z += nz * (r - d);
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        b.vx -= (1 + k.netRestitution) * vn * nx;
        b.vy -= (1 + k.netRestitution) * vn * ny;
        b.vz -= (1 + k.netRestitution) * vn * nz;
        emit(events, 'net', -vn, side);
      }
    }
  }
}
