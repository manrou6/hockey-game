/**
 * Abstract per-tick command for one player. Humans (keyboard, joystick, gamepad) and AI
 * both produce this, so the simulation never knows where input came from.
 */
export interface PlayerCommand {
  /** Desired movement direction on the rink plane, magnitude 0..1 (x = rink length, y = rink width). */
  moveX: number;
  moveY: number;
  /** Hold to sprint (REGATE held, Shift, RB/RT). */
  sprint: boolean;
  /** Button presses this tick (edges, not holds): PASE, TIRO, REGATE (tap). */
  pass: boolean;
  shoot: boolean;
  dribble: boolean;
}

export function emptyCommand(): PlayerCommand {
  return { moveX: 0, moveY: 0, sprint: false, pass: false, shoot: false, dribble: false };
}
