import type { Tuning } from '../config/tuning';

// Strength solvers (same force model as the ball physics, integrated per tick). Used by the
// automatic pass strength (src/sim/pass.ts) and the wall pass (src/sim/wallPass.ts).

export const SOLVER_DT = 1 / 120;
export const SOLVER_MAX_TIME = 6;
export const BISECT_STEPS = 28;

export interface RollResult {
  /** Speed when it has rolled `dist` metres (0 if it stops before). */
  speed: number;
  time: number;
}

/** Roll a ball on the floor from speed v0 for `dist` metres. */
export function roll(v0: number, dist: number, k: Tuning['ball'], out: RollResult): RollResult {
  let v = v0;
  let x = 0;
  let t = 0;
  while (x < dist && t < SOLVER_MAX_TIME) {
    v = Math.max(0, v - (k.rollingDecel + k.rollingDrag * v) * SOLVER_DT);
    v *= Math.max(0, 1 - k.airDrag * v * SOLVER_DT);
    if (v <= 0) {
      out.speed = 0;
      out.time = Infinity;
      return out;
    }
    x += v * SOLVER_DT;
    t += SOLVER_DT;
  }
  out.speed = x >= dist ? v : 0;
  out.time = x >= dist ? t : Infinity;
  return out;
}
