import type { Tuning } from '../config/tuning';
import type { PlayerState } from './player';

/**
 * Per-player "feel" numbers (docs/DECISIONS 2026-10-02, design for F2).
 *
 * TUNING holds the values of an AVERAGE player. All movement code (skating, trencada,
 * dribbling) must read its numbers through these accessors, never `tuning.skating` etc.
 * directly. Today they return the base values unchanged (no allocation). In F2 player
 * attributes (speed, acceleration, agility, control, passing, shooting…) will modulate the
 * base values here within a configurable range (e.g. ±10-15 %), cached per player, without
 * touching the movement logic. Agility, for example, could shorten the trencada's pre-brake
 * and strengthen its exit.
 */
export function skatingFor(_p: PlayerState, tuning: Tuning): Tuning['skating'] {
  return tuning.skating;
}

export function cutFor(_p: PlayerState, tuning: Tuning): Tuning['cut'] {
  return tuning.cut;
}

export function dribbleFor(_p: PlayerState, tuning: Tuning): Tuning['dribble'] {
  return tuning.dribble;
}
