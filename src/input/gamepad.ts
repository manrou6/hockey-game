import { TUNING } from '../config/tuning';

/** First connected gamepad: left stick to skate, RB/RT to sprint (standard mapping). */
export function readGamepad(out: { x: number; y: number; sprint: boolean }): boolean {
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
    out.sprint = Boolean(pad.buttons[5]?.pressed || pad.buttons[7]?.pressed);
    return true;
  }
  return false;
}
