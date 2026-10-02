import { goalLineX, RINK, type RinkConfig } from '../config/rink';

/** Result of a collision query. `depth` > 0 means overlap; normal points away from the obstacle. */
export interface Contact {
  depth: number;
  nx: number;
  ny: number;
}

/**
 * Signed distance from point (x, y) to the inside of the boards (rounded rectangle).
 * Negative inside the rink, positive outside. `outNormal` receives the outward normal.
 */
export function boardSignedDistance(x: number, y: number, outNormal: { nx: number; ny: number }, rink: RinkConfig = RINK): number {
  const r = rink.cornerRadius;
  const hx = rink.length / 2 - r;
  const hy = rink.width / 2 - r;
  const sx = x < 0 ? -1 : 1;
  const sy = y < 0 ? -1 : 1;
  const qx = Math.abs(x) - hx;
  const qy = Math.abs(y) - hy;
  if (qx > 0 && qy > 0) {
    // Corner arc region.
    const len = Math.hypot(qx, qy);
    outNormal.nx = (sx * qx) / len;
    outNormal.ny = (sy * qy) / len;
    return len - r;
  }
  if (qx > qy) {
    outNormal.nx = sx;
    outNormal.ny = 0;
    return qx - r;
  }
  outNormal.nx = 0;
  outNormal.ny = sy;
  return qy - r;
}

/** Circle (centre x,y, radius) vs boards. Writes into `out`, returns true if overlapping. */
export function collideBoards(x: number, y: number, radius: number, out: Contact, rink: RinkConfig = RINK): boolean {
  const n = { nx: 0, ny: 0 };
  const sd = boardSignedDistance(x, y, n, rink);
  const depth = sd + radius;
  if (depth <= 0) return false;
  // Push back inside: normal points towards the rink interior.
  out.depth = depth;
  out.nx = -n.nx;
  out.ny = -n.ny;
  return true;
}

/** Axis-aligned footprint of each goal cage on the floor (posts + net), sim coordinates. */
export interface GoalFootprint {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function goalFootprints(rink: RinkConfig = RINK): [GoalFootprint, GoalFootprint] {
  const halfW = rink.goalWidth / 2 + rink.goalPostDiameter;
  const make = (side: -1 | 1): GoalFootprint => {
    const gx = goalLineX(side, rink);
    const back = gx + side * rink.goalDepthBottom;
    return { minX: Math.min(gx, back), maxX: Math.max(gx, back), minY: -halfW, maxY: halfW };
  };
  return [make(-1), make(1)];
}

const GOALS = goalFootprints();

/** Circle vs axis-aligned box. Writes the push-out contact into `out`. */
export function collideBox(x: number, y: number, radius: number, box: GoalFootprint, out: Contact): boolean {
  const cx = Math.min(Math.max(x, box.minX), box.maxX);
  const cy = Math.min(Math.max(y, box.minY), box.maxY);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    if (d2 >= radius * radius) return false;
    const d = Math.sqrt(d2);
    out.depth = radius - d;
    out.nx = dx / d;
    out.ny = dy / d;
    return true;
  }
  // Centre inside the box: push out along the axis of least penetration.
  const left = x - box.minX;
  const right = box.maxX - x;
  const down = y - box.minY;
  const up = box.maxY - y;
  const m = Math.min(left, right, down, up);
  out.nx = m === left ? -1 : m === right ? 1 : 0;
  out.ny = m === down ? -1 : m === up ? 1 : 0;
  if (out.nx !== 0) out.ny = 0;
  out.depth = m + radius;
  return true;
}

/** All static obstacles (boards + both goals) for a circle. Calls `onContact` for each overlap. */
export function collideStatic(x: number, y: number, radius: number, onContact: (c: Contact) => void): void {
  const c: Contact = { depth: 0, nx: 0, ny: 0 };
  if (collideBoards(x, y, radius, c)) onContact(c);
  for (const g of GOALS) if (collideBox(x, y, radius, g, c)) onContact(c);
}
