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
    radius: 0.3,
    /** Top speed skating normally (also with the ball), and sprinting without the ball.
     * Round 1 (Guillem): +12 % over the initial 7.5 / 9. */
    maxSpeed: 8.4,
    sprintSpeed: 12.6,
    /** Acceleration from standstill; it fades as speed nears the cap (strong start, ~1.5 s to 90 %). */
    accel: 11.2,
    /** The fade is computed against cap × this factor so the target speed is reached in finite time. */
    accelCapFactor: 1.07,
    /** Angle between stick and motion beyond which the skater skid-stops instead of turning. */
    brakeAngle: 2.2,
    /** Sprint push: extra acceleration for a short time when a sprint starts, how far above
     * the sprint top speed it may briefly go, and the minimum time between two pushes. */
    sprintBoostTime: 0.25,
    sprintBoostAccel: 24.5,
    sprintBoostOvershoot: 0.5,
    sprintBoostCooldown: 0.8,
    /** Four-wheel skid stop (stick reversed, or released abruptly at speed): time to lose all
     * speed, how much it slides (1 = even, > 1 slides longer, < 1 bites earlier), body turn
     * towards the skid side (rad), min speed for a release to skid, how far the stick must have
     * been pushed, and how recently (s), for a release to count as abrupt. */
    skidTime: 0.5,
    skidSlide: 1.25,
    skidBodyTurn: 1.27409,
    skidMinSpeed: 3.5,
    skidReleaseStick: 0.6,
    skidReleaseWindow: 0.1,
    /** Coasting when the stick is released: constant + proportional deceleration (smooth glide). */
    glideDecel: 2.3,
    glideDrag: 0.73,
    /** Natural slow-down when above the target speed (leaving a sprint, stick eased back). */
    overspeedDecel: 7.2,
    /** Minimum turning radius = base + perSpeed2 × speed² (no sharp turns at full speed). */
    turnRadiusBase: 0.35,
    turnRadiusPerSpeed2: 0.12,
    /** Max turning rate at low speed. */
    maxTurnRate: 11.693706,
    /** Speed lost per radian turned at full lock (tight turns cost speed). */
    turnSpeedLoss: 1.15,
    /** Below this speed the skater pivots on the spot towards the stick direction. */
    pivotSpeed: 2.8,
    /** Turning rate while pivoting (nearly still). */
    pivotTurnRate: 30.019663,
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
  /**
   * Trencada: lateral four-wheel cut that redirects (docs/03 §1). Triggered at ≥ minSpeed when
   * the stick is flicked (turned ≥ minAngle within gestureTime) to between minAngle and
   * skating.brakeAngle from the travel direction. During `duration` the old speed fades and
   * `redirect` of it goes to the new direction; the body turns bodyTurn towards the cut. Exit:
   * push exitAccel for exitTime (shares the sprint push cooldown). Angles in rad.
   */
  cut: {
    minAngle: 1.0471976,
    minSpeed: 5,
    gestureTime: 0.15,
    /** Pre-brake before turning (s) along the old direction, and the share of speed it loses:
     * the defender's chance to react. */
    prepTime: 0.3,
    prepSpeedLoss: 0.35,
    duration: 0.18,
    /** Exit speed as a share of the speed you had before the trencada. */
    redirect: 0.38,
    bodyTurn: 0.7853982,
    exitAccel: 8,
    exitTime: 0.2,
    /** Time between trencadas, counted from the END of the manoeuvre (s). */
    cooldown: 0.8,
    /** After the cut, no sprint for this long even with the thumb in the ring (re-accelerate). */
    noSprintTime: 0.6,
    /** 1 = only with the thumb in the sprint zone (option B), 0 = always (option A). */
    onlyWithSprint: 0,
    /** Extra ball separation during a cut at normal top speed (reduced by Control as usual). */
    ballSeparation: 0.35,
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
    /** Extra separation during a four-wheel skid stop at full normal speed (the ball runs on). */
    skidSeparation: 0.4,
    /** Opponent distance at which pressure starts (full pressure at contact). */
    pressureRadius: 1.8,
    /** How much a perfect Control attribute (99) reduces separation (0 = no advantage, 1 = none at all). */
    controlAdvantage: 0.5,
    /** Metres skated between two stick touches. */
    touchDistance: 2,
    /** Separation above which the ball can get away, and how fast (per metre of excess, per second). */
    safeSeparation: 0.35,
    lossRate: 3,
    /** Taking a loose ball: reach from the blade and max height (how well it is controlled:
     * the `receive` section). */
    pickupRadius: 0.45,
    pickupMaxHeight: 0.35,
    /** Time after passing/shooting/losing it before the same player can take the ball again (s). */
    relockTime: 0.3,
    /** Sprint top speed while carrying the ball (sprint without ball: skating.sprintSpeed). */
    sprintSpeedWithBall: 9.3,
    /** PROVISIONAL until F1.5: quick shot speed (m/s). */
    shotSpeed: 22,
  },
  /**
   * Passing (docs/03 §3, F1.4b). PASE tap = ground pass, hold = lofted pass; the pass leaves
   * when the button is released. Values of an AVERAGE player (Pase attribute modulates them
   * through src/sim/feel.ts in F2).
   */
  pass: {
    /** PASE (v0.1.17): the height is chosen apart (slide up / U / LB); holding the button
     * charges the power. Held shorter than tapTime = a tap (automatic power); then the power
     * rises from 0 to 1 over powerChargeTime (s). */
    tapTime: 0.2,
    powerChargeTime: 0.6,
    /** Ground pass to a teammate: launch speed so it reaches him at arrivalSpeed, within
     * [minSpeed, maxSpeed]; to nobody: noTargetSpeed (m/s). Charging adds speed up to maxSpeed. */
    groundArrivalSpeed: 14,
    groundMinSpeed: 17,
    groundMaxSpeed: 30,
    groundNoTargetSpeed: 18,
    /** Driven lofted pass (real ballistics, v0.1.14): it leaves the stick from the floor at
     * the launch angle needed to peak at about maxHeight (m) over the distance, never steeper
     * than launchAngle (rad, short passes), with the speed (≤ maxSpeed, m/s) that makes it land
     * landShort (m) before the receiver; then only gravity, bounce and rolling. If that flat a
     * pass can't get there at maxSpeed, it is hit at maxSpeed a little higher so it still
     * arrives (v0.1.15). To nobody it lands noTargetDistance away (m). The drop angle is not set: physics makes it ≈ the launch
     * angle (a bit steeper with air drag). */
    driveLaunchAngle: 0.4363323,
    driveMaxHeight: 1.2,
    driveMaxSpeed: 20,
    /** Fully charged driven pass: up to this speed, flatter (same landing point). */
    driveChargeMaxSpeed: 26,
    driveLandShort: 1.5,
    driveNoTargetDistance: 18,
    /** Fully charged driven pass to nobody lands this far (m). */
    driveNoTargetMaxDistance: 30,
    /** Lob (physical arc): launch angle (rad), lands this far before the receiver (m),
     * maximum launch speed (m/s), and distance range to nobody (by power). */
    loftAngle: 0.5235988,
    loftLandShort: 1,
    loftMaxSpeed: 24,
    loftMinDistance: 6,
    loftMaxDistance: 30,
    /** How much the pass leads a moving receiver (0 = to where he is, 1 = to where he'll be). */
    lead: 1,
    /** Direction error (rad, random but deterministic, about ±1 standard deviation): always,
     * at full sprint, under full pressure and when off balance (skid / trencada). */
    errorBase: 0.0261799,
    errorSprint: 0.0872665,
    errorPressure: 0.0698132,
    errorOffBalance: 0.1047198,
    /** Lofted passes (driven and lob) multiply the direction error by this. */
    errorLoft: 1.5,
    /** Strength error (fraction of the speed, ±1 standard deviation). */
    errorPower: 0.04,
    /** How much a perfect Pase attribute (99) reduces the errors (0 = nothing, 1 = no error). */
    attributeAdvantage: 0.5,
  },
  /**
   * Reception (F1.4c, docs/03 §3): every time a loose ball reaches a stick it is rolled once
   * (deterministic) how well it is controlled. Difficulty = speed + where it comes from +
   * height/bounce + the receiver's state + stretching, reduced by the Control attribute, plus
   * some randomness; then: clean < heavyAt ≤ heavy touch < reboundAt ≤ rebound < missAt ≤ miss.
   * Values of an AVERAGE player (read through src/sim/feel.ts receiveFor).
   */
  receive: {
    /** Reception zone of the receiver of an aimed pass: the ball within this distance of his
     * body (m, low enough) reaches his stick (stretching for it: harder, see stretchPenalty).
     * Anybody else needs it at the blade (dribble.pickupRadius). */
    reach: 0.65,
    /** Ball speed relative to the receiver (m/s): up to easySpeed it adds nothing; at hardSpeed
     * it adds 1 (a rebound on its own for an average player, before Control). */
    easySpeed: 10,
    hardSpeed: 25,
    /** Faster than this (relative, m/s) nobody can touch it: it goes past. */
    maxRelSpeed: 30,
    /** Coming from behind the receiver (vs. from the front); from the side counts half. */
    behindPenalty: 0.6,
    /** Arriving in the air at dribble.pickupMaxHeight, and bouncing at bounceSpeed (m/s) or more. */
    heightPenalty: 0.3,
    bouncePenalty: 0.2,
    bounceSpeed: 3,
    /** Receiver at full sprint, and off balance (skid stop or trencada). */
    sprintPenalty: 0.25,
    offBalancePenalty: 0.4,
    /** Stretching: the ball at the edge of the reception zone, far from the blade. */
    stretchPenalty: 0.5,
    /** How much a perfect Control attribute (99) reduces the difficulty (0 = nothing, 1 = all). */
    controlAdvantage: 0.5,
    /** Random spread added to the difficulty (total width; 0 = always the same outcome). */
    randomness: 0.35,
    /** Outcome thresholds of the final difficulty. */
    heavyAt: 0.35,
    reboundAt: 0.7,
    missAt: 1.05,
    /** Heavy touch: the ball stays this far off the stick at first (m; it may get away). */
    heavySeparation: 0.55,
    /** Rebound: it bounces back off the stick keeping this fraction of its relative speed,
     * within ±spread (rad) of straight back, popping up at lift (m/s). */
    reboundKeep: 0.35,
    reboundSpread: 0.7,
    reboundLift: 1,
    /** After a rebound or a miss he can't touch it again for this long (s). */
    lockTime: 0.25,
    /** First-touch pass: a pass leaving within this time of the reception (s) has its error
     * multiplied by firstTouchError (and more after a hard reception: × (1 + difficulty)). */
    firstTouchWindow: 0.2,
    firstTouchError: 1.6,
    /** 1 = a short coloured ring under the receiver shows how the reception went (render):
     * green clean, yellow heavy touch, orange rebound, red miss; it lasts feedbackTime (s). */
    showFeedback: 1,
    feedbackTime: 0.6,
  },
  /**
   * Pass assist (docs/03 §3): the teammate closest to the aimed direction inside the cone is
   * the receiver; the direction is corrected towards him by `correction` (0..1) and the
   * strength is automatic. Level chosen in Settings (Desactivada / Ligera / Fuerte).
   */
  assist: {
    lightCone: 0.4363323,
    lightCorrection: 0.7,
    strongCone: 0.7853982,
    strongCorrection: 1,
    /** 1 = ring on the floor under the teammate the pass would go to. */
    targetRing: 1,
  },
  /**
   * Teammates test bench (F1.4) and who the human controls. Final design (docs/03 §3): after
   * a pass the control goes to the receiver and the passer moves on his own (FIFA-like).
   */
  mates: {
    /** 1 = control goes to the receiver of a pass (and to a teammate who picks up a loose
     * ball); 0 = you always keep your player and the teammates give the ball back. */
    switchControl: 1,
    /** After a switch the stick keeps being ignored for the new player (he goes to the ball
     * on his own) until it is released or turned at least this much (rad). */
    switchLatchAngle: 0.7853982,
    /** 1 = a pass that dies untouched (hits something, stops, or goes past the receiver out
     * of reach) gives the control to the teammate nearest the ball (v0.1.16). */
    lostPassSwitch: 1,
    /** 1 = while the ball is loose (nobody of the team has it) the control goes to the
     * teammate nearest the ball (v0.1.17). Hysteresis: only if he is at least switchMargin (m)
     * nearer than the controlled one, for switchDelay (s), and not within switchCooldown (s)
     * of the last switch. */
    autoSwitch: 1,
    switchMargin: 1.5,
    switchDelay: 0.25,
    switchCooldown: 0.6,
    /** 1 = with the stick released, the controlled player goes to meet a pass coming to him. */
    autoReceive: 1,
    /** 1 = teammates move to offer a passing line; 0 = they stand still. */
    move: 1,
    /** Support spot relative to the ball carrier (or the controlled player): ahead towards
     * the attacked goal and to each side (m). */
    supportAhead: 3,
    supportSide: 5,
    /** Speed while moving to the support spot (fraction of the normal top speed), and the
     * distance where they start slowing down to arrive (m). */
    supportSpeed: 0.6,
    arriveRadius: 1.5,
    /** A moving loose ball is "for" a teammate if its path passes this close (m) within
     * interceptMaxTime (s); he then goes to meet it at interceptSpeed (fraction of top speed). */
    interceptRadius: 2.5,
    interceptMaxTime: 2.5,
    interceptSpeed: 1,
    /** A slow loose ball this close (m) to a teammate (and closer to him than to you) is
     * picked up by him. */
    fetchRadius: 4,
    /** Only with switchControl = 0: time a teammate keeps the ball before giving it back (s). */
    returnDelay: 0.5,
    /** So they don't mirror you: each teammate has his own rhythm (speed ± this fraction)
     * and his support spot drifts slowly by up to this many metres. */
    speedVariation: 0.15,
    spotVariation: 1.5,
  },
  /** Arrow on the floor showing the pass while PASE is held (and a moment after a tap):
   * final direction (with the assist), length by strength, colour by kind (render only). */
  passArrow: {
    /** Length for the weakest and the strongest pass (m). */
    minLength: 1.2,
    maxLength: 4.5,
    /** Launch speed that counts as "strongest" (m/s). */
    fullSpeed: 22,
    width: 0.28,
    /** Starts this far from the passer (m), so it covers neither him nor the ball. */
    startOffset: 1,
    /** How long it stays after the pass leaves (s). */
    afterTime: 0.35,
  },
  /** Human input devices (docs/03 §3). */
  input: {
    /** PASE height by sliding the finger up on the button (CSS px of the landscape layout;
     * ~60 px ≈ 1 cm on a Pixel 8a): from slideDrive = driven lofted, from slideLob = lob. */
    passSlideDrive: 60,
    passSlideLob: 120,
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
    joystickZone: 0.4,
    /** Gamepad stick dead zone (raw axis units). */
    gamepadDeadZone: 0.29,
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
    /** CANVI (switch player): small, to the left of PASE, out of the path of the slide up on
     * PASE and away from TIRO/REGATE. */
    switchRight: 262,
    switchBottom: 52,
    switchSize: 62,
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
