/**
 * PASE height from where the finger has been dragged while holding the button (docs/03 §3,
 * v0.1.20): a diagonal drag up-RIGHT = driven lofted pass (1: the common one, and the
 * comfortable direction for the right thumb), up-LEFT = lob (2); anything else (a tap, a
 * hold, a short drag, a straight-up or downward drag) = low pass (0).
 *
 * `dx` is to the right and `dy` upwards, both in CSS px of the landscape layout, measured
 * from where the finger went down. The drag must be at least `distance` px long and lean at
 * least `minAngle` rad from the vertical (up to nearly horizontal). Pure: no DOM.
 */
export function dragHeight(dx: number, dy: number, distance: number, minAngle: number): 0 | 1 | 2 {
  if (dy <= 0 || Math.hypot(dx, dy) < distance) return 0;
  // Angle from straight up: 0 = vertical, π/2 = horizontal.
  const lean = Math.atan2(Math.abs(dx), dy);
  if (lean < minAngle || lean > MAX_LEAN) return 0;
  return dx > 0 ? 1 : 2;
}

/** A drag flatter than this (rad from the vertical) is a sideways swipe, not a lift. */
const MAX_LEAN = (85 * Math.PI) / 180;
