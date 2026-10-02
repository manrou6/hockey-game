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
  /** TV broadcast camera (docs/03 §6). Distances in metres, angles in radians. */
  camera: {
    /** Camera height above the floor. */
    height: 10,
    /** Horizontal distance from the rink's long axis to the camera (behind the near boards). */
    distance: 21,
    /** How much the camera dollies along the stand following the action (0 = fixed, 1 = full). */
    trackFactor: 0.82,
    /** Look-ahead: aim this many seconds ahead of the followed target's velocity. */
    lookaheadTime: 0.35,
    /** Critically damped smoothing time (s). Lower = snappier, higher = smoother. */
    smoothTime: 0.4,
    /** How much the aim point follows the target across the rink width (0..1). */
    lookAcrossFactor: 0.45,
    /** Vertical field of view at rest, and extra FOV at full speed (dynamic zoom). */
    fov: 0.6,
    fovSpeedGain: 0.06,
    /** Speed (m/s) at which the full extra FOV is applied. */
    fovSpeedRef: 9,
  },
};

export type Tuning = typeof TUNING;
