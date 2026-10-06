import { TUNING } from '../config/tuning';
import type { ActionEdges } from './actionButtons';
import { mapStick, type MappedStick } from './stickMapping';

// Standard mapping: left stick to skate (pushed fully = sprint), RB/RT also sprint;
// A = PASE (hold = more power), LB held = driven lofted pass, LB+RB = lob (then RB doesn't
// sprint), B = TIRO, X = REGATE, Y = CANVI (switch player).
const prev: boolean[] = [];
/** A physical stick at its rim reads ~0.95-1.0; that's the sprint zone on a gamepad. */
const GAMEPAD_SPRINT_TRAVEL = 0.95;
let stickSprinting = false;
const mapped: MappedStick = { x: 0, y: 0, sprint: false };

/** First connected gamepad. Writes movement/sprint into `out` and button presses into `edges`. */
export function readGamepad(out: { x: number; y: number; sprint: boolean; passHeld?: boolean; passHeight?: number }, edges: ActionEdges | null): boolean {
  out.passHeld = false;
  out.passHeight = 0;
  out.x = 0;
  out.y = 0;
  out.sprint = false;
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const i = TUNING.input;
    mapStick(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0), stickSprinting, {
      deadZone: i.gamepadDeadZone,
      curve: i.joystickCurve,
      threshold: GAMEPAD_SPRINT_TRAVEL,
      hysteresis: i.sprintHysteresis,
    }, mapped);
    stickSprinting = mapped.sprint;
    out.x = mapped.x;
    out.y = mapped.y;
    const pressed = (b: number): boolean => Boolean(pad.buttons[b]?.pressed);
    const lb = pressed(4);
    out.passHeight = lb ? (pressed(5) ? 2 : 1) : 0;
    out.sprint = (mapped.x !== 0 || mapped.y !== 0) && (mapped.sprint || (pressed(5) && !lb) || pressed(7));
    out.passHeld = pressed(0);
    if (edges) {
      if (pressed(0) && !prev[0]) {
        edges.pass = true;
        edges.passHeight = 0;
      }
      if (!pressed(0) && prev[0]) edges.passHeight = out.passHeight ?? 0;
      if (pressed(1) && !prev[1]) edges.shoot = true;
      if (pressed(2) && !prev[2]) edges.dribble = true;
      if (pressed(3) && !prev[3]) edges.switch = true;
      for (let b = 0; b < 4; b++) prev[b] = pressed(b);
    }
    return true;
  }
  return false;
}
