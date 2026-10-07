import { TUNING } from '../config/tuning';

/** Slowest and fastest game speed the loop accepts (the panel offers 0.8-1.4). */
export const MIN_GAME_SPEED = 0.5;
export const MAX_GAME_SPEED = 2;

/** Game seconds that pass during `realSeconds` of real time at the current game speed. */
export function gameSeconds(realSeconds: number, speed: number = TUNING.game.speed): number {
  const s = Number.isFinite(speed) ? Math.min(MAX_GAME_SPEED, Math.max(MIN_GAME_SPEED, speed)) : 1;
  return realSeconds * s;
}
