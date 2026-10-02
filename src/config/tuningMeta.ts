// Ranges and display info for every tunable "game feel" number shown in the mobile
// tuning panel. Labels live in i18n under `tuning.<path>`. Values are stored in SI
// units (m, s, rad); `scale` converts to the displayed unit (e.g. rad → °).

export interface TuningParamMeta {
  /** "section.key" inside TUNING. */
  path: string;
  /** Range and step in DISPLAY units. */
  min: number;
  max: number;
  step: number;
  /** Display unit (not translated: SI symbols). */
  unit: string;
  /** stored × scale = displayed. Default 1. */
  scale?: number;
  /** i18n key of the label when shared between sections (default `tuning.<path>`). */
  labelKey?: string;
  /** Shown as a Sí/No switch (stored as 0 / 1). */
  toggle?: boolean;
}

export interface TuningSectionMeta {
  id: 'skating' | 'cut' | 'dribble' | 'ball' | 'input' | 'buttons' | 'camera' | 'cameraTv' | 'cameraClose' | 'cameraTactical';
  params: TuningParamMeta[];
}

const DEG = 180 / Math.PI;

/** Same parameters (and shared labels `tuning.cam.<key>`) for every camera preset. */
function cameraPresetParams(section: string): TuningParamMeta[] {
  const p = (key: string, min: number, max: number, step: number, unit: string, scale?: number): TuningParamMeta => ({
    path: `${section}.${key}`,
    min,
    max,
    step,
    unit,
    labelKey: `tuning.cam.${key}`,
    ...(scale === undefined ? {} : { scale }),
  });
  return [
    p('fov', 20, 80, 1, '°', DEG),
    p('height', 2, 35, 0.5, 'm'),
    p('distance', 3, 35, 0.5, 'm'),
    p('ballWeight', 0, 1, 0.05, ''),
    p('lookaheadTime', 0, 1, 0.05, 's'),
    p('smoothTime', 0.05, 1.5, 0.05, 's'),
    p('depthFollow', 0, 1, 0.05, ''),
    p('trackFactor', 0, 1, 0.02, ''),
    p('lookAcrossFactor', 0, 1, 0.05, ''),
    p('fovSpeedGain', 0, 15, 0.5, '°', DEG),
    p('fovSpeedRef', 3, 15, 0.5, 'm/s'),
    p('ballScale', 0.5, 3, 0.05, '×'),
  ];
}

/** Sections and parameters in the order shown (most impactful first). `sim` is not tunable. */
export const TUNING_SECTIONS: TuningSectionMeta[] = [
  {
    id: 'skating',
    params: [
      { path: 'skating.maxSpeed', min: 4, max: 12, step: 0.1, unit: 'm/s' },
      { path: 'skating.sprintSpeed', min: 5, max: 14, step: 0.1, unit: 'm/s' },
      { path: 'skating.accel', min: 3, max: 25, step: 0.5, unit: 'm/s²' },
      { path: 'skating.accelCapFactor', min: 1.01, max: 1.3, step: 0.01, unit: '×' },
      { path: 'skating.maxTurnRate', min: 90, max: 900, step: 10, unit: '°/s', scale: DEG },
      { path: 'skating.turnRadiusBase', min: 0, max: 2, step: 0.05, unit: 'm' },
      { path: 'skating.turnRadiusPerSpeed2', min: 0, max: 0.2, step: 0.005, unit: 'm·s²/m²' },
      { path: 'skating.turnSpeedLoss', min: 0, max: 1.5, step: 0.05, unit: '/rad' },
      { path: 'skating.sprintBoostAccel', min: 0, max: 30, step: 0.5, unit: 'm/s²' },
      { path: 'skating.sprintBoostTime', min: 0, max: 0.6, step: 0.01, unit: 's' },
      { path: 'skating.sprintBoostOvershoot', min: 0, max: 2, step: 0.1, unit: 'm/s' },
      { path: 'skating.sprintBoostCooldown', min: 0, max: 3, step: 0.1, unit: 's' },
      { path: 'skating.skidTime', min: 0.2, max: 1.2, step: 0.02, unit: 's' },
      { path: 'skating.skidSlide', min: 0.4, max: 3, step: 0.05, unit: '' },
      { path: 'skating.skidBodyTurn', min: 0, max: 90, step: 1, unit: '°', scale: DEG },
      { path: 'skating.skidMinSpeed', min: 1, max: 15, step: 0.5, unit: 'm/s' },
      { path: 'skating.skidReleaseStick', min: 0.1, max: 1, step: 0.05, unit: '' },
      { path: 'skating.skidReleaseWindow', min: 0.03, max: 0.4, step: 0.01, unit: 's' },
      { path: 'skating.brakeAngle', min: 90, max: 180, step: 1, unit: '°', scale: DEG },
      { path: 'skating.glideDecel', min: 0, max: 3, step: 0.05, unit: 'm/s²' },
      { path: 'skating.glideDrag', min: 0, max: 1, step: 0.01, unit: '/s' },
      { path: 'skating.overspeedDecel', min: 0.5, max: 10, step: 0.1, unit: 'm/s²' },
      { path: 'skating.pivotSpeed', min: 0, max: 4, step: 0.1, unit: 'm/s' },
      { path: 'skating.pivotTurnRate', min: 180, max: 1800, step: 20, unit: '°/s', scale: DEG },
      { path: 'skating.wallRestitution', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'skating.wallFriction', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'skating.playerRestitution', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'skating.radius', min: 0.2, max: 0.6, step: 0.01, unit: 'm' },
    ],
  },
  {
    id: 'cut',
    params: [
      { path: 'cut.minAngle', min: 30, max: 120, step: 1, unit: '°', scale: DEG },
      { path: 'cut.minSpeed', min: 1, max: 12, step: 0.5, unit: 'm/s' },
      { path: 'cut.gestureTime', min: 0.05, max: 0.5, step: 0.01, unit: 's' },
      { path: 'cut.duration', min: 0.1, max: 0.6, step: 0.01, unit: 's' },
      { path: 'cut.redirect', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
      { path: 'cut.bodyTurn', min: 0, max: 90, step: 1, unit: '°', scale: DEG },
      { path: 'cut.exitAccel', min: 0, max: 40, step: 0.5, unit: 'm/s²' },
      { path: 'cut.exitTime', min: 0, max: 0.6, step: 0.01, unit: 's' },
      { path: 'cut.cooldown', min: 0, max: 3, step: 0.1, unit: 's' },
      { path: 'cut.onlyWithSprint', min: 0, max: 1, step: 1, unit: '', toggle: true },
      { path: 'cut.ballSeparation', min: 0, max: 1.2, step: 0.05, unit: 'm' },
    ],
  },
  {
    id: 'dribble',
    params: [
      { path: 'dribble.baseSeparation', min: 0, max: 0.3, step: 0.01, unit: 'm' },
      { path: 'dribble.sprintSeparation', min: 0, max: 1.2, step: 0.05, unit: 'm' },
      { path: 'dribble.turnSeparation', min: 0, max: 1.2, step: 0.05, unit: 'm' },
      { path: 'dribble.turnThreshold', min: 0, max: 0.95, step: 0.05, unit: '' },
      { path: 'dribble.pressureSeparation', min: 0, max: 1.2, step: 0.05, unit: 'm' },
      { path: 'dribble.skidSeparation', min: 0, max: 1.2, step: 0.05, unit: 'm' },
      { path: 'dribble.controlAdvantage', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'dribble.followTime', min: 0, max: 0.2, step: 0.005, unit: 's' },
      { path: 'dribble.safeSeparation', min: 0.1, max: 1.5, step: 0.05, unit: 'm' },
      { path: 'dribble.lossRate', min: 0, max: 15, step: 0.5, unit: '/m·s' },
      { path: 'dribble.touchDistance', min: 0.5, max: 5, step: 0.1, unit: 'm' },
      { path: 'dribble.sprintSpeedWithBall', min: 6, max: 12, step: 0.1, unit: 'm/s' },
      { path: 'dribble.stickForward', min: 0.3, max: 0.9, step: 0.01, unit: 'm' },
      { path: 'dribble.stickSide', min: -0.4, max: 0.4, step: 0.01, unit: 'm' },
      { path: 'dribble.pickupRadius', min: 0.2, max: 1, step: 0.05, unit: 'm' },
      { path: 'dribble.pickupMaxRelSpeed', min: 3, max: 30, step: 0.5, unit: 'm/s' },
      { path: 'dribble.pickupMaxHeight', min: 0.05, max: 1, step: 0.05, unit: 'm' },
      { path: 'dribble.pressureRadius', min: 0.5, max: 4, step: 0.1, unit: 'm' },
      { path: 'dribble.relockTime', min: 0, max: 1, step: 0.05, unit: 's' },
      { path: 'dribble.passSpeed', min: 4, max: 25, step: 0.5, unit: 'm/s' },
      { path: 'dribble.shotSpeed', min: 8, max: 35, step: 0.5, unit: 'm/s' },
    ],
  },
  {
    id: 'ball',
    params: [
      { path: 'ball.boardRestitution', min: 0.2, max: 1, step: 0.05, unit: '' },
      { path: 'ball.rollingDecel', min: 0, max: 3, step: 0.05, unit: 'm/s²' },
      { path: 'ball.rollingDrag', min: 0, max: 0.5, step: 0.01, unit: '/s' },
      { path: 'ball.floorRestitution', min: 0, max: 0.9, step: 0.05, unit: '' },
      { path: 'ball.floorFriction', min: 0, max: 0.6, step: 0.02, unit: '' },
      { path: 'ball.boardFriction', min: 0, max: 0.6, step: 0.02, unit: '' },
      { path: 'ball.boardJitter', min: 0, max: 15, step: 0.5, unit: '°', scale: DEG },
      { path: 'ball.postRestitution', min: 0.1, max: 1, step: 0.05, unit: '' },
      { path: 'ball.netRestitution', min: 0, max: 0.6, step: 0.05, unit: '' },
      { path: 'ball.netDamping', min: 1, max: 20, step: 0.5, unit: '/s' },
      { path: 'ball.playerRestitution', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'ball.airDrag', min: 0, max: 0.03, step: 0.0005, unit: '/m' },
      { path: 'ball.visualScale', min: 1, max: 3, step: 0.1, unit: '×' },
      { path: 'ball.visualRefDistance', min: 8, max: 40, step: 0.5, unit: 'm' },
      { path: 'ball.markerRadius', min: 0, max: 0.6, step: 0.02, unit: 'm' },
    ],
  },
  {
    id: 'input',
    params: [
      { path: 'input.sprintThreshold', min: 70, max: 130, step: 1, unit: '%', scale: 100 },
      { path: 'input.joystickCurve', min: 1, max: 3, step: 0.1, unit: '' },
      { path: 'input.joystickDeadZone', min: 0, max: 40, step: 1, unit: '%', scale: 100 },
      { path: 'input.sprintHysteresis', min: 0, max: 15, step: 1, unit: '%', scale: 100 },
      { path: 'input.bufferTime', min: 0, max: 0.4, step: 0.01, unit: 's' },
      { path: 'input.joystickRadiusPx', min: 30, max: 140, step: 2, unit: 'px' },
      { path: 'input.joystickZone', min: 0.3, max: 0.8, step: 0.05, unit: '' },
      { path: 'input.gamepadDeadZone', min: 0, max: 0.5, step: 0.01, unit: '' },
    ],
  },
  {
    id: 'buttons',
    params: (['dribble', 'pass', 'shoot'] as const).flatMap((b) => [
      { path: `buttons.${b}Bottom`, min: 0, max: 300, step: 2, unit: 'px' },
      { path: `buttons.${b}Right`, min: 0, max: 450, step: 2, unit: 'px' },
      { path: `buttons.${b}Size`, min: 50, max: 160, step: 2, unit: 'px' },
    ]),
  },
  { id: 'cameraTv', params: cameraPresetParams('cameraTv') },
  { id: 'cameraClose', params: cameraPresetParams('cameraClose') },
  { id: 'cameraTactical', params: cameraPresetParams('cameraTactical') },
  {
    id: 'camera',
    params: [{ path: 'camera.transitionTime', min: 0, max: 2, step: 0.05, unit: 's' }],
  },

];

export const TUNING_PARAMS: TuningParamMeta[] = TUNING_SECTIONS.flatMap((s) => s.params);
