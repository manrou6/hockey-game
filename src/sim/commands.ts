/**
 * Abstract per-tick command for one player. Humans (keyboard, joystick, gamepad) and AI
 * both produce this, so the simulation never knows where input came from.
 */
export interface PlayerCommand {
  /**
   * Desired movement on the rink plane (x = rink length, y = rink width). Direction = where
   * to skate; magnitude 0..1 = fraction of the normal top speed (already mapped from the
   * device: dead zone and response curve are applied by the input layer).
   */
  moveX: number;
  moveY: number;
  /** Sprinting (joystick in the sprint zone, Shift, gamepad stick at full / RB-RT). */
  sprint: boolean;
  /** Button presses this tick (edges, not holds): PASE, TIRO, REGATE (tap). */
  pass: boolean;
  shoot: boolean;
  dribble: boolean;
  /** PASE is being held down: holding charges the power; the pass leaves on release. */
  passHeld: boolean;
  /** Height chosen for the pass (docs/03 §3, v0.1.17): 0 = low (ground), 1 = driven lofted
   * ("alt fort"), 2 = lob. Touch: slide the finger up on PASE; keyboard U; gamepad LB(+RB). */
  passHeight: number;
  /** CANVI pressed this tick: switch to the teammate nearest the ball. */
  switchPlayer: boolean;
}

export function emptyCommand(): PlayerCommand {
  return { moveX: 0, moveY: 0, sprint: false, pass: false, shoot: false, dribble: false, passHeld: false, passHeight: 0, switchPlayer: false };
}
