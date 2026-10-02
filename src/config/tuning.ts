// All "game feel" numbers live here (CLAUDE.md rule 4). Values are starting points
// from docs/03 and are meant to be tuned live from the debug panel (?debug=1).
// The object is intentionally mutable so the debug panel can edit it at runtime.

export const TUNING = {
  sim: {
    /** Fixed simulation rate (Hz). */
    tickRate: 60,
    /** Max sim steps per rendered frame before dropping time (avoids spiral of death). */
    maxStepsPerFrame: 5,
  },
};

export type Tuning = typeof TUNING;
