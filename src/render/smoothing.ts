/**
 * Critically damped spring towards a target (Game Programming Gems 4, "smooth damp").
 * No overshoot, no jitter, frame-rate independent. `state.v` holds the current velocity.
 */
export interface DampState {
  value: number;
  v: number;
}

export function smoothDamp(state: DampState, target: number, smoothTime: number, dt: number): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  // Prevent overshoot.
  if (target - state.value > 0 === out > target) {
    out = target;
    state.v = 0;
  }
  state.value = out;
  return out;
}
