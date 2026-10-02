import { TUNING } from '../config/tuning';
import type { ActionEdges } from './actionButtons';

// Standard mapping: left stick to skate, A = PASE, B = TIRO, X = REGATE (tap) / hold = sprint,
// RB/RT = sprint.
const prev: boolean[] = [];
let xDownAt = 0;

/** First connected gamepad. Writes movement/sprint into `out` and button presses into `edges`. */
export function readGamepad(out: { x: number; y: number; sprint: boolean }, edges: ActionEdges | null): boolean {
  out.x = 0;
  out.y = 0;
  out.sprint = false;
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const mag = Math.hypot(ax, ay);
    if (mag > TUNING.input.gamepadDeadZone) {
      const m = Math.min(1, mag);
      out.x = (ax / mag) * m;
      out.y = (-ay / mag) * m; // screen up = +y
    }
    const pressed = (i: number): boolean => Boolean(pad.buttons[i]?.pressed);
    const x = pressed(2);
    out.sprint = pressed(5) || pressed(7) || x;
    if (edges) {
      if (pressed(0) && !prev[0]) edges.pass = true;
      if (pressed(1) && !prev[1]) edges.shoot = true;
      if (x && !prev[2]) xDownAt = performance.now();
      if (!x && prev[2] && performance.now() - xDownAt <= TUNING.input.tapTime * 1000) edges.dribble = true;
      for (let i = 0; i < 3; i++) prev[i] = pressed(i);
    }
    return true;
  }
  return false;
}
