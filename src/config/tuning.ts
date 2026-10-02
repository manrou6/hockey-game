// All "game feel" numbers live here (CLAUDE.md rule 4). Values are starting points
// from docs/03 and are tuned live on the phone from the tuning panel (Settings → tuning
// mode). The object is intentionally mutable so the panel can edit it at runtime; the
// factory values are kept in TUNING_DEFAULTS. Ranges/labels for the panel: tuningMeta.ts.

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
    /** Bounce against boards/goals, and Coulomb friction coefficient (tangential loss ∝ impact). */
    wallRestitution: 0.2,
    wallFriction: 0.25,
    /** Bounce between two players (shoulder contact; proper physical duels in F1+). */
    playerRestitution: 0.3,
  },
  /** Ball physics (docs/03 §2). Size/mass are rule data (config/rink.ts). */
  ball: {
    /** Rolling resistance on the floor: constant (m/s²) and speed-proportional (1/s) parts. */
    rollingDecel: 0.45,
    rollingDrag: 0.06,
    /** Air drag: deceleration = airDrag × v² (≈ real value for a 155 g, 7.3 cm ball). */
    airDrag: 0.0076,
    /** Bounce on the floor (vertical restitution) and grip that slows sliding on each bounce. */
    floorRestitution: 0.45,
    floorFriction: 0.1,
    /** Bounce off the boards: restitution (~0.7 per docs) and tangential friction. */
    boardRestitution: 0.7,
    boardFriction: 0.12,
    /** Deterministic random deflection on each board hit (max angle, rad) so it's never a billiard table. */
    boardJitter: 0.05,
    /** Bounce off posts/crossbar, off the outside of the goal net, and off players' bodies. */
    postRestitution: 0.6,
    netRestitution: 0.15,
    playerRestitution: 0.35,
    /** How fast the net kills the ball's speed once inside the goal (1/s). */
    netDamping: 8,
    /** Visual size multiplier so the 7.3 cm ball reads from the TV camera (render only).
     * It is compensated by camera distance: at `visualRefDistance` it is exactly this value,
     * further away it grows, closer it shrinks (never below real size). */
    visualScale: 2,
    visualRefDistance: 23,
    /** Radius of the soft marker drawn on the floor under the ball (m, 0 = off). Helps read
     * where the ball is and how high it flies (render only). */
    markerRadius: 0.22,
  },
  /** Dribbling: carrying the ball on the stick (docs/03 §2). Distances in m. */
  dribble: {
    /** Where the stick blade carries the ball: ahead of the body centre and to the right. */
    stickForward: 0.55,
    stickSide: 0.14,
    /** How quickly the ball follows the blade (s). Small = glued, larger = more lag/wobble. */
    followTime: 0.035,
    /** Separation at normal speed: tiny push-and-catch on each touch (very controlled). */
    baseSeparation: 0.03,
    /** Extra separation when sprinting beyond normal top speed, in a tight turn at speed,
     * and under pressure from a nearby opponent (each at its maximum). */
    sprintSeparation: 0.45,
    turnSeparation: 0.5,
    pressureSeparation: 0.4,
    /** Only turns tighter than this fraction of the max turn rate separate the ball (0..1). */
    turnThreshold: 0.6,
    /** Opponent distance at which pressure starts (full pressure at contact). */
    pressureRadius: 1.8,
    /** How much a perfect Control attribute (99) reduces separation (0 = no advantage, 1 = none at all). */
    controlAdvantage: 0.5,
    /** Metres skated between two stick touches. */
    touchDistance: 2,
    /** Separation above which the ball can get away, and how fast (per metre of excess, per second). */
    safeSeparation: 0.35,
    lossRate: 3,
    /** Taking a loose ball: reach from the blade, max height and max relative speed. */
    pickupRadius: 0.45,
    pickupMaxHeight: 0.35,
    pickupMaxRelSpeed: 11,
    /** Time after passing/shooting/losing it before the same player can take the ball again (s). */
    relockTime: 0.3,
    /** Sprint top speed while carrying the ball (sprint without ball: skating.sprintSpeed). */
    sprintSpeedWithBall: 8.3,
    /** PROVISIONAL until F1.4/F1.5: ground pass speed and quick shot speed (m/s). */
    passSpeed: 12,
    shotSpeed: 22,
  },
  /** Human input devices (docs/03 §3). */
  input: {
    /** Input buffer: a PASE/TIRO pressed this long before you get the ball still fires (s). */
    bufferTime: 0.15,
    /**
     * Analog speed on the virtual joystick (docs/03 §3, changed 2026-10-02): thumb travel
     * (0 = centre, 1 = edge of the ring) below `joystickDeadZone` does nothing; from there to
     * `sprintThreshold` the speed rises from 0 to the normal top speed following
     * `joystickCurve` (1 = linear, 2 = much finer control at low tilt); from `sprintThreshold`
     * on it's a sprint. Values above 1 mean "drag beyond the edge of the ring".
     * `sprintHysteresis`: once sprinting, it only stops below threshold − this (no flicker).
     */
    joystickDeadZone: 0.12,
    joystickCurve: 1.5,
    sprintThreshold: 0.9,
    sprintHysteresis: 0.04,
    /** Floating joystick: drag distance (CSS px) for a full push. */
    joystickRadiusPx: 60,
    /** Fraction of the screen width (from the left) where a touch spawns the joystick. */
    joystickZone: 0.5,
    /** Gamepad stick dead zone (raw axis units). */
    gamepadDeadZone: 0.15,
  },
  /** Right-thumb action buttons: distance from the right and bottom edges, and diameter
   * (CSS px of the landscape layout). Editable live from the tuning panel. */
  buttons: {
    passRight: 158,
    passBottom: 24,
    passSize: 84,
    shootRight: 34,
    shootBottom: 34,
    shootSize: 100,
    dribbleRight: 52,
    dribbleBottom: 150,
    dribbleSize: 84,
  },
  /** Camera system shared settings (docs/03 §6). */
  camera: {
    /** Duration of the smooth blend when switching camera preset (s). */
    transitionTime: 0.6,
  },
  /**
   * Camera presets (docs/03 §6). All "broadcast rig" presets share the same parameters:
   * - height / distance: camera height and its distance behind the action (m);
   * - depthFollow: how much the camera moves across the rink width with the action (0 = stays in the stand);
   * - trackFactor: how much it dollies along the rink length (0 = fixed, 1 = full);
   * - lookAcrossFactor: how much the aim point follows the action across the width;
   * - fov / fovSpeedGain / fovSpeedRef: zoom at rest, extra zoom-out at speed and the speed for full extra (rad, rad, m/s);
   * - smoothTime: critically damped smoothing (s); lookaheadTime: aim ahead of the movement (s);
   * - ballWeight: aim point between the controlled player (0) and the ball (1).
   * - ballScale: extra multiplier on the ball's visual size for this camera (render only).
   */
  /** 1. TV side camera (default): broadcast view, wide. */
  cameraTv: {
    height: 10,
    distance: 21,
    depthFollow: 0,
    trackFactor: 0.82,
    lookAcrossFactor: 0.45,
    fov: 0.6,
    fovSpeedGain: 0.06,
    fovSpeedRef: 9,
    smoothTime: 0.4,
    lookaheadTime: 0.35,
    ballWeight: 0.65,
    ballScale: 1,
  },
  /** 2. Close camera: tighter, follows player and ball, for dribbling and shooting detail. */
  cameraClose: {
    height: 5.5,
    distance: 9.5,
    depthFollow: 0.55,
    trackFactor: 1,
    lookAcrossFactor: 0.75,
    fov: 0.62,
    fovSpeedGain: 0.08,
    fovSpeedRef: 9,
    smoothTime: 0.28,
    lookaheadTime: 0.3,
    ballWeight: 0.5,
    ballScale: 1.8,
  },
  /** 3. High / tactical camera: higher and wider, to read passes and positions. */
  cameraTactical: {
    height: 26,
    distance: 14,
    depthFollow: 0.15,
    trackFactor: 0.95,
    lookAcrossFactor: 0.25,
    fov: 0.8,
    fovSpeedGain: 0.02,
    fovSpeedRef: 9,
    smoothTime: 0.6,
    lookaheadTime: 0.5,
    ballWeight: 0.7,
    ballScale: 1.25,
  },

};

export type Tuning = typeof TUNING;

/** Factory values, captured before any saved player override is applied. */
export const TUNING_DEFAULTS: Tuning = JSON.parse(JSON.stringify(TUNING)) as Tuning;
