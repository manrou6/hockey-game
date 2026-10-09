import type { Tuning } from '../config/tuning';
import type { WorldState } from '../sim/world';

// Slow-mo of the remate en el aire (F1.5e, docs/03 §3): while a ball in the air comes to the
// controlled player's stick, game time runs slower for a moment. Like the game speed it only
// scales how much game time each real frame advances (fewer fixed ticks per real second): the
// simulation, its fixed 60 Hz steps and its results are untouched.

export type SlowMoTuning = Tuning['slowMo'];

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Time scale `t` real seconds into a slow-mo: eases from 1 down to `scale` over rampIn, stays,
 * and eases back up to 1 over rampOut, `duration` s in all (the ramps shrink to fit if needed).
 * 1 outside [0, duration].
 */
export function slowMoScale(t: number, k: SlowMoTuning): number {
  const total = Math.max(0, k.duration);
  if (!(t >= 0 && t < total)) return 1;
  const ramps = Math.max(1e-6, k.rampIn + k.rampOut);
  const fit = Math.min(1, total / ramps);
  const rampIn = Math.max(1e-6, k.rampIn * fit);
  const rampOut = Math.max(1e-6, k.rampOut * fit);
  const low = Math.min(1, Math.max(0.05, k.scale));
  const depth = Math.min(smooth(t / rampIn), smooth((total - t) / rampOut));
  return 1 - (1 - low) * depth;
}

/**
 * Game seconds that pass during a slow-mo (from its start) and real seconds it takes for a given
 * game interval: used by the tests and the report to tell how much longer the good timing lasts.
 */
export function slowMoGameTime(realSeconds: number, k: SlowMoTuning, dt = 1 / 2000): number {
  let g = 0;
  for (let t = 0; t < realSeconds; t += dt) g += slowMoScale(t + dt / 2, k) * Math.min(dt, realSeconds - t);
  return g;
}

/** Drives the slow-mo from the world's volley view (src/sim/world.ts `volley`), once per ball. */
export class SlowMo {
  /** Real seconds since the current slow-mo started (−1 = none). */
  private t = -1;
  /** This ball already had its slow-mo (cleared once no ball is coming to his stick). */
  private spent = false;
  /** Time scale of the last frame (1 = normal). */
  scale = 1;

  /**
   * Advance by `realSeconds` (the frame) and return the time scale for it. It starts when a ball
   * in the air is `lead` s (game time) from the controlled player's stick with the TIR window
   * open, if it is on (k.enabled ≥ 0.5).
   */
  update(world: WorldState, realSeconds: number, k: SlowMoTuning): number {
    const v = world.volley;
    const coming = world.ball.owner < 0 && v.found;
    if (this.t < 0) {
      if (!coming) this.spent = false;
      else if (!this.spent && k.enabled >= 0.5 && v.open && v.contactTick < 0 && v.time <= k.lead) {
        this.t = 0;
        this.spent = true;
      }
    }
    if (this.t >= 0) {
      this.scale = slowMoScale(this.t, k);
      this.t += Math.max(0, realSeconds);
      if (this.t >= k.duration || k.enabled < 0.5) this.t = -1;
    } else this.scale = 1;
    return this.scale;
  }

  /** Stop any slow-mo now (e.g. on pause). */
  reset(): void {
    this.t = -1;
    this.scale = 1;
  }
}
