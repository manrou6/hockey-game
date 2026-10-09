import type { Tuning } from '../config/tuning';
import type { WorldState } from '../sim/world';

// Feedback of the remate en el aire outside the simulation (v0.1.29): a live diagnosis for the
// tuning panel (is the window open, the time scale, how many windows have opened and the last
// one) and the vibration of a perfect strike. Read once per rendered frame from the world.

/** Vibration pattern (ms) of a perfect remate en el aire: a pulse, then an optional short tail. */
export function vibrationPattern(k: Tuning['haptics']): number[] {
  const on = Math.max(0, Math.round(k.volleyMs));
  const tail = Math.max(0, Math.round(k.volleyTailMs));
  if (on <= 0) return [];
  return tail > 0 ? [on, Math.max(0, Math.round(k.volleyGapMs)), tail] : [on];
}

/** What the tuning panel shows about the remate en el aire. */
export interface VolleyDiagnosis {
  /** The TIR window is open now (a ball in the air is coming to the controlled player's stick). */
  open: boolean;
  /** Time scale of the last frame (1 = normal; the slow-mo lowers it). */
  scale: number;
  /** Windows opened since the game started. */
  opens: number;
  /** The last window: predicted height of the ball at the stick (m), the ball's distance to the
   * controlled player when it opened (m), and the timing of its strike (s; NaN = not struck). */
  lastHeight: number;
  lastDistance: number;
  lastTiming: number;
}

export class VolleyFeedback {
  readonly diagnosis: VolleyDiagnosis = { open: false, scale: 1, opens: 0, lastHeight: Number.NaN, lastDistance: Number.NaN, lastTiming: Number.NaN };
  private lastShotTick: number;

  constructor(
    world: WorldState,
    /** Plays a vibration pattern (navigator.vibrate on the phone; injectable for tests). */
    private readonly vibrate: (pattern: number[]) => void,
  ) {
    this.lastShotTick = world.lastShotTick;
  }

  /** Once per rendered frame, after the sim ticks of that frame. */
  update(world: WorldState, scale: number, tuning: Tuning, vibration: boolean): void {
    const d = this.diagnosis;
    const v = world.volley;
    const open = v.open && world.ball.owner < 0;
    if (open && !d.open) {
      d.opens++;
      d.lastHeight = v.height;
      const p = world.players[world.controlled];
      d.lastDistance = p ? Math.hypot(world.ball.x - p.x, world.ball.y - p.y) : Number.NaN;
      d.lastTiming = Number.NaN;
    }
    d.open = open;
    d.scale = scale;
    if (world.lastShotTick !== this.lastShotTick) {
      this.lastShotTick = world.lastShotTick;
      const shot = world.lastShot;
      if (shot.aerial && world.lastShotPlayer === world.controlled) {
        d.lastTiming = shot.timing;
        if (vibration && Math.abs(shot.timing) <= tuning.volley.good + 1e-9) {
          const pattern = vibrationPattern(tuning.haptics);
          if (pattern.length) this.vibrate(pattern);
        }
      }
    }
  }
}
