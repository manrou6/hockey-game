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
  /** PASE is being held down (tap = ground pass, hold = lofted; it leaves on release). */
  passHeld: boolean;
}

export function emptyCommand(): PlayerCommand {
  return { moveX: 0, moveY: 0, sprint: false, pass: false, shoot: false, dribble: false, passHeld: false };
}
