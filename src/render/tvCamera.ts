import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { TUNING } from '../config/tuning';
import { smoothDamp, type DampState } from './smoothing';

/**
 * Broadcast-style camera: elevated in the central stand on one long side, dollying along
 * the rink to follow the action with look-ahead, critically damped (no jitter), and a
 * slight zoom-out at speed. Sim plane (x, y) = Babylon (x, z); the camera sits at -z.
 */
export class TvCamera {
  readonly camera: TargetCamera;
  private readonly x: DampState = { value: 0, v: 0 };
  private readonly z: DampState = { value: 0, v: 0 };
  private readonly fov: DampState = { value: TUNING.camera.fov, v: 0 };
  private readonly target = new Vector3();

  constructor(scene: Scene) {
    const c = TUNING.camera;
    this.camera = new TargetCamera('tvCamera', new Vector3(0, c.height, -c.distance), scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 200;
    this.camera.fov = c.fov;
    this.camera.setTarget(Vector3.Zero());
  }

  /** Follow a point on the rink (sim coordinates) moving at (vx, vy) m/s. */
  update(x: number, y: number, vx: number, vy: number, dt: number): void {
    const c = TUNING.camera;
    const fx = smoothDamp(this.x, x + vx * c.lookaheadTime, c.smoothTime, dt);
    const fz = smoothDamp(this.z, y + vy * c.lookaheadTime, c.smoothTime, dt);
    const speed = Math.hypot(vx, vy);
    const fov = smoothDamp(this.fov, c.fov + c.fovSpeedGain * Math.min(1, speed / c.fovSpeedRef), c.smoothTime * 2, dt);
    this.camera.position.set(fx * c.trackFactor, c.height, -c.distance);
    this.target.set(fx, 0, fz * c.lookAcrossFactor);
    this.camera.setTarget(this.target);
    this.camera.fov = fov;
  }
}
