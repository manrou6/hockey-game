// Default positions of the right-thumb action buttons (CSS px from the bottom-right
// corner of the landscape layout, plus diameter). An arc around the resting thumb:
// TIRO biggest at the corner, PASE to its left, REGATE above. The button-position
// editor (F1.7, or earlier if needed) will save per-device overrides on top of these.

export type ActionId = 'pass' | 'shoot' | 'dribble';

export interface ButtonPlacement {
  right: number;
  bottom: number;
  size: number;
}

export const DEFAULT_BUTTON_LAYOUT: Record<ActionId, ButtonPlacement> = {
  shoot: { right: 34, bottom: 34, size: 100 },
  pass: { right: 158, bottom: 24, size: 84 },
  dribble: { right: 52, bottom: 150, size: 84 },
};
