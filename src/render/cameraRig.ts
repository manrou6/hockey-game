import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { TUNING } from '../config/tuning';
import {
  BroadcastRigPreset,
  CameraDirector,
  type CameraContext,
  type CameraPreset,
  type CameraPresetId,
} from './cameraPresets';

/**
 * The single game camera (docs/03 §6). It renders whatever pose the CameraDirector
 * produces; switching preset blends smoothly. Add new presets (F3 special cameras) to
 * `createPresets` without touching this class.
 */
export class CameraRig {
  readonly camera: TargetCamera;
  private readonly director: CameraDirector;
  private readonly target = new Vector3();

  constructor(scene: Scene, initial: CameraPresetId) {
    this.camera = new TargetCamera('gameCamera', new Vector3(0, 10, -21), scene);
    this.camera.minZ = 0.3;
    this.camera.maxZ = 200;
    this.director = new CameraDirector(createPresets(), initial, () => TUNING.camera.transitionTime);
  }

  get preset(): CameraPresetId {
    return this.director.activeId;
  }

  setPreset(id: CameraPresetId): void {
    this.director.setPreset(id);
  }

  update(ctx: CameraContext): void {
    const pose = this.director.update(ctx);
    this.camera.position.set(pose.px, pose.py, pose.pz);
    this.target.set(pose.tx, pose.ty, pose.tz);
    this.camera.setTarget(this.target);
    this.camera.fov = pose.fov;
  }
}

function createPresets(): Map<CameraPresetId, CameraPreset> {
  const list: CameraPreset[] = [
    new BroadcastRigPreset('tv', () => TUNING.cameraTv),
    new BroadcastRigPreset('close', () => TUNING.cameraClose),
    new BroadcastRigPreset('tactical', () => TUNING.cameraTactical),
  ];
  return new Map(list.map((p) => [p.id, p]));
}
