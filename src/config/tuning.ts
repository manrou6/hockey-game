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
  /** Skater movement (docs/03 §1). Speeds m/s, accelerations m/s², angles rad. */
  skating: {
    /** Collision radius of a player on the rink plane. */
    radius: 0.35,
    /** Top speed skating normally (with ball in F1+), and sprinting. */
    maxSpeed: 7.5,
    sprintSpeed: 9,
    /** Acceleration from standstill; it fades as speed nears the cap (strong start, ~1.8 s to 7 m/s). */
    accel: 10,
    /** The fade is computed against cap × this factor so the target speed is reached in finite time. */
    accelCapFactor: 1.05,
    /** T-stop deceleration when the stick points against the motion (~0.6 s from top speed). */
    brakeDecel: 12.5,
    /** Angle between stick and motion beyond which the skater brakes instead of turning. */
    brakeAngle: 2.2,
    /** Coasting when the stick is released: constant + proportional deceleration (smooth glide). */
    glideDecel: 0.45,
    glideDrag: 0.12,
    /** Deceleration when above the target speed (sprint released or stick half-pushed). */
    overspeedDecel: 2.5,
    /** Minimum turning radius = base + perSpeed2 × speed² (no sharp turns at full speed). */
    turnRadiusBase: 0.35,
    turnRadiusPerSpeed2: 0.055,
    /** Max turning rate at low speed. */
    maxTurnRate: 7,
    /** Speed lost per radian turned at full lock (tight turns cost speed). */
    turnSpeedLoss: 0.35,
    /** Below this speed the skater pivots on the spot towards the stick direction. */
    pivotSpeed: 1.2,
    /** Turning rate while pivoting (nearly still). */
    pivotTurnRate: 16,
    /** Stick dead zone (0..1). */
    deadZone: 0.12,
    /** Bounce against boards/goals, and Coulomb friction coefficient (tangential loss ∝ impact). */
    wallRestitution: 0.2,
    wallFriction: 0.25,
    /** Bounce between two players (shoulder contact; proper physical duels in F1+). */
    playerRestitution: 0.3,
  },
  /** Human input devices (docs/03 §3). */
  input: {
    /** Floating joystick: drag distance (CSS px) for a full push. */
    joystickRadiusPx: 60,
    /** Fraction of the screen width (from the left) where a touch spawns the joystick. */
    joystickZone: 0.5,
    /** Gamepad stick dead zone (raw axis units). */
    gamepadDeadZone: 0.15,
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
