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
}

export interface TuningSectionMeta {
  id: 'skating' | 'input' | 'camera';
  params: TuningParamMeta[];
}

const DEG = 180 / Math.PI;

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
      { path: 'skating.brakeDecel', min: 4, max: 30, step: 0.5, unit: 'm/s²' },
      { path: 'skating.brakeAngle', min: 90, max: 180, step: 1, unit: '°', scale: DEG },
      { path: 'skating.glideDecel', min: 0, max: 3, step: 0.05, unit: 'm/s²' },
      { path: 'skating.glideDrag', min: 0, max: 1, step: 0.01, unit: '/s' },
      { path: 'skating.overspeedDecel', min: 0.5, max: 10, step: 0.1, unit: 'm/s²' },
      { path: 'skating.pivotSpeed', min: 0, max: 4, step: 0.1, unit: 'm/s' },
      { path: 'skating.pivotTurnRate', min: 180, max: 1800, step: 20, unit: '°/s', scale: DEG },
      { path: 'skating.deadZone', min: 0, max: 0.4, step: 0.01, unit: '' },
      { path: 'skating.wallRestitution', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'skating.wallFriction', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'skating.playerRestitution', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'skating.radius', min: 0.2, max: 0.6, step: 0.01, unit: 'm' },
    ],
  },
  {
    id: 'input',
    params: [
      { path: 'input.joystickRadiusPx', min: 30, max: 140, step: 2, unit: 'px' },
      { path: 'input.joystickZone', min: 0.3, max: 0.8, step: 0.05, unit: '' },
      { path: 'input.gamepadDeadZone', min: 0, max: 0.5, step: 0.01, unit: '' },
    ],
  },
  {
    id: 'camera',
    params: [
      { path: 'camera.fov', min: 20, max: 70, step: 1, unit: '°', scale: DEG },
      { path: 'camera.height', min: 4, max: 20, step: 0.5, unit: 'm' },
      { path: 'camera.distance', min: 10, max: 35, step: 0.5, unit: 'm' },
      { path: 'camera.lookaheadTime', min: 0, max: 1, step: 0.05, unit: 's' },
      { path: 'camera.smoothTime', min: 0.05, max: 1.5, step: 0.05, unit: 's' },
      { path: 'camera.trackFactor', min: 0, max: 1, step: 0.02, unit: '' },
      { path: 'camera.lookAcrossFactor', min: 0, max: 1, step: 0.05, unit: '' },
      { path: 'camera.fovSpeedGain', min: 0, max: 15, step: 0.5, unit: '°', scale: DEG },
      { path: 'camera.fovSpeedRef', min: 3, max: 15, step: 0.5, unit: 'm/s' },
    ],
  },
];

export const TUNING_PARAMS: TuningParamMeta[] = TUNING_SECTIONS.flatMap((s) => s.params);
