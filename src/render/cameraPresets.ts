// Camera presets as pure math (no Babylon), so they can be unit-tested and new presets
// (F3: behind the shooter for direct free hits/penalties, replay cameras) can be added
// without touching the rig. A preset turns the game context into a desired pose; the
// rig (cameraRig.ts) applies it and blends smoothly when the preset changes.

import { smoothDamp, type DampState } from './smoothing';

/** Ids are persisted in settings: never rename, only add. */
export const CAMERA_PRESET_IDS = ['tv', 'close', 'tactical'] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

export function isCameraPresetId(v: unknown): v is CameraPresetId {
  return typeof v === 'string' && (CAMERA_PRESET_IDS as readonly string[]).includes(v);
}

/** What the camera can look at this frame. Babylon axes: x = rink length, z = rink width. */
export interface CameraContext {
  playerX: number;
  playerZ: number;
  playerVx: number;
  playerVz: number;
  ballX: number;
  ballZ: number;
  ballVx: number;
  ballVz: number;
  dt: number;
}

/** Camera position, the point it looks at, and vertical field of view (rad). */
export interface CameraPose {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  /** Extra multiplier for the ball's visual size in this view (blended in transitions). */
  ballScale: number;
}

export function createPose(): CameraPose {
  return { px: 0, py: 10, pz: -20, tx: 0, ty: 0, tz: 0, fov: 0.6, ballScale: 1 };
}

export function copyPose(from: CameraPose, to: CameraPose): void {
  to.px = from.px;
  to.py = from.py;
  to.pz = from.pz;
  to.tx = from.tx;
  to.ty = from.ty;
  to.tz = from.tz;
  to.fov = from.fov;
  to.ballScale = from.ballScale;
}

/** out = a + (b - a) × t */
export function lerpPose(a: CameraPose, b: CameraPose, t: number, out: CameraPose): void {
  out.px = a.px + (b.px - a.px) * t;
  out.py = a.py + (b.py - a.py) * t;
  out.pz = a.pz + (b.pz - a.pz) * t;
  out.tx = a.tx + (b.tx - a.tx) * t;
  out.ty = a.ty + (b.ty - a.ty) * t;
  out.tz = a.tz + (b.tz - a.tz) * t;
  out.fov = a.fov + (b.fov - a.fov) * t;
  out.ballScale = a.ballScale + (b.ballScale - a.ballScale) * t;
}

/** Ease in-out for transitions (zero speed at both ends: no jolt). */
export function smoothstep(t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

export interface CameraPreset {
  readonly id: CameraPresetId;
  /** Snap internal smoothing to the current context (used when the preset becomes active). */
  reset(ctx: CameraContext): void;
  /** Advance smoothing and write the desired pose. */
  update(ctx: CameraContext, out: CameraPose): void;
}

/** Tunable numbers of a broadcast-style rig (TUNING.cameraTv / cameraClose / cameraTactical). */
export interface BroadcastRigParams {
  height: number;
  distance: number;
  depthFollow: number;
  trackFactor: number;
  lookAcrossFactor: number;
  fov: number;
  fovSpeedGain: number;
  fovSpeedRef: number;
  smoothTime: number;
  lookaheadTime: number;
  ballWeight: number;
  ballScale: number;
}

/**
 * A camera on the near side of the rink (−z) that follows an aim point between the
 * controlled player and the ball, with look-ahead, critically damped smoothing and a
 * small zoom-out at speed. TV, close and tactical are the same rig with different numbers.
 */
export class BroadcastRigPreset implements CameraPreset {
  private readonly x: DampState = { value: 0, v: 0 };
  private readonly z: DampState = { value: 0, v: 0 };
  private readonly fov: DampState = { value: 0.6, v: 0 };

  constructor(
    readonly id: CameraPresetId,
    /** Read every frame so live tuning applies instantly. */
    private readonly params: () => BroadcastRigParams,
  ) {}

  private aim(ctx: CameraContext, p: BroadcastRigParams): { x: number; z: number; speed: number } {
    const w = p.ballWeight;
    const vx = ctx.playerVx + (ctx.ballVx - ctx.playerVx) * w;
    const vz = ctx.playerVz + (ctx.ballVz - ctx.playerVz) * w;
    return {
      x: ctx.playerX + (ctx.ballX - ctx.playerX) * w + vx * p.lookaheadTime,
      z: ctx.playerZ + (ctx.ballZ - ctx.playerZ) * w + vz * p.lookaheadTime,
      speed: Math.hypot(ctx.playerVx, ctx.playerVz),
    };
  }

  reset(ctx: CameraContext): void {
    const p = this.params();
    const a = this.aim(ctx, p);
    this.x.value = a.x;
    this.x.v = 0;
    this.z.value = a.z;
    this.z.v = 0;
    this.fov.value = p.fov;
    this.fov.v = 0;
  }

  update(ctx: CameraContext, out: CameraPose): void {
    const p = this.params();
    const a = this.aim(ctx, p);
    const fx = smoothDamp(this.x, a.x, p.smoothTime, ctx.dt);
    const fz = smoothDamp(this.z, a.z, p.smoothTime, ctx.dt);
    const fov = smoothDamp(this.fov, p.fov + p.fovSpeedGain * Math.min(1, a.speed / p.fovSpeedRef), p.smoothTime * 2, ctx.dt);
    out.px = fx * p.trackFactor;
    out.py = p.height;
    out.pz = fz * p.depthFollow - p.distance;
    out.tx = fx;
    out.ty = 0;
    out.tz = fz * p.lookAcrossFactor;
    out.fov = fov;
    out.ballScale = p.ballScale;
  }
}

/**
 * Keeps the active preset and blends from the previous camera pose to the new preset
 * over `transitionTime` with an ease-in-out curve (no sudden jump).
 */
export class CameraDirector {
  private active: CameraPreset;
  private readonly from = createPose();
  private readonly target = createPose();
  readonly pose = createPose();
  private blendT = 1;
  private needsReset = true;

  constructor(
    private readonly presets: ReadonlyMap<CameraPresetId, CameraPreset>,
    initial: CameraPresetId,
    private readonly transitionTime: () => number,
  ) {
    this.active = this.get(initial);
  }

  private get(id: CameraPresetId): CameraPreset {
    const p = this.presets.get(id);
    if (!p) throw new Error(`Unknown camera preset ${id}`);
    return p;
  }

  get activeId(): CameraPresetId {
    return this.active.id;
  }

  /** True while blending between two presets. */
  get transitioning(): boolean {
    return this.blendT < 1;
  }

  setPreset(id: CameraPresetId): void {
    if (id === this.active.id) return;
    copyPose(this.pose, this.from);
    this.active = this.get(id);
    this.needsReset = true;
    this.blendT = this.transitionTime() > 0 ? 0 : 1;
  }

  update(ctx: CameraContext): CameraPose {
    if (this.needsReset) {
      this.active.reset(ctx);
      this.needsReset = false;
    }
    this.active.update(ctx, this.target);
    if (this.blendT < 1) {
      const dur = this.transitionTime();
      this.blendT = dur > 0 ? Math.min(1, this.blendT + ctx.dt / dur) : 1;
      lerpPose(this.from, this.target, smoothstep(this.blendT), this.pose);
    } else {
      copyPose(this.target, this.pose);
    }
    return this.pose;
  }
}
