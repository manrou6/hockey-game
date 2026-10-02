import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import type { WorldState } from '../sim/world';
import { buildRink } from './rinkBuilder';
import { TvCamera } from './tvCamera';

const PLAYER_RADIUS_VISUAL = 0.35;
const PLAYER_HEIGHT_VISUAL = 1.75;

/**
 * Owns the Babylon engine and scene, and draws a WorldState interpolated by `alpha`.
 * Sim coordinates (x along length, y along width) map to Babylon (x, 0, z).
 */
export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly tvCamera: TvCamera;
  private shadows: ShadowGenerator | null = null;
  private readonly keyLight: DirectionalLight;
  private quality: QualityLevel;
  private readonly playerMeshes: Mesh[] = [];
  /** Index of the player the TV camera follows (until there is a ball). */
  followPlayer = 0;

  constructor(canvas: HTMLCanvasElement, quality: QualityLevel) {
    this.quality = quality;
    // MSAA is fixed at engine creation, so it is always on; presets only change things
    // that can be switched at runtime (pixel ratio, shadows).
    this.engine = new Engine(
      canvas,
      true,
      { stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', disableWebGL2Support: false },
      false,
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.03, 0.05, 0.09, 1);
    this.scene.skipPointerMovePicking = true;
    this.scene.autoClear = true;

    // Base lighting: warm sports-hall ambient + one shadow-casting key light from above.
    const hemi = new HemisphericLight('hallAmbient', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.65;
    hemi.diffuse = new Color3(1, 0.96, 0.9);
    hemi.groundColor = new Color3(0.25, 0.27, 0.32);
    const key = new DirectionalLight('hallKey', new Vector3(-0.25, -1, 0.35).normalize(), this.scene);
    key.position = new Vector3(8, 25, -12);
    key.intensity = 0.75;
    key.diffuse = new Color3(1, 0.97, 0.92);
    key.shadowMinZ = 1;
    key.shadowMaxZ = 60;
    key.autoUpdateExtends = false;
    key.shadowFrustumSize = 48;
    this.keyLight = key;

    buildRink(this.scene);
    this.tvCamera = new TvCamera(this.scene);
    this.scene.activeCamera = this.tvCamera.camera;
    this.setQuality(quality);

    // The canvas changes size on window resize, rotation and fullscreen; a ResizeObserver
    // fires after layout has settled (Android can report stale sizes in resize events).
    const onResize = (): void => {
      this.applyPixelRatio(QUALITY_PRESETS[this.quality].maxPixelRatio);
      this.engine.resize();
    };
    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(canvas);
  }

  /** Apply a quality preset immediately (no reload, so fullscreen/orientation are kept). */
  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality];
    this.applyPixelRatio(preset.maxPixelRatio);
    this.engine.resize();
    const currentSize = this.shadows?.getShadowMap()?.getSize().width ?? 0;
    if (currentSize === preset.shadowMapSize) return;
    this.shadows?.dispose();
    this.shadows = null;
    if (preset.shadowMapSize > 0) {
      const sg = new ShadowGenerator(preset.shadowMapSize, this.keyLight);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_LOW;
      sg.bias = 0.002;
      for (const m of this.playerMeshes) sg.addShadowCaster(m, true);
      this.shadows = sg;
    }
  }

  /** Render at min(devicePixelRatio, cap) to keep fill-rate inside the mobile budget. */
  private applyPixelRatio(maxPixelRatio: number): void {
    const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    this.engine.setHardwareScalingLevel(1 / ratio);
  }

  private ensurePlayerMeshes(count: number): void {
    while (this.playerMeshes.length < count) {
      const i = this.playerMeshes.length;
      const body = CreateCapsule(`player${i}`, { radius: PLAYER_RADIUS_VISUAL, height: PLAYER_HEIGHT_VISUAL, tessellation: 12, subdivisions: 2 }, this.scene);
      const mat = new StandardMaterial(`playerMat${i}`, this.scene);
      mat.diffuseColor = new Color3(0.86, 0.16, 0.2);
      mat.specularColor = new Color3(0.2, 0.2, 0.2);
      body.material = mat;
      // Facing marker ("chest"): shows heading until real models arrive in F4.
      const nose = CreateBox(`playerNose${i}`, { width: 0.18, height: 0.18, depth: 0.5 }, this.scene);
      nose.rotation.y = Math.PI / 2;
      nose.position.set(PLAYER_RADIUS_VISUAL, 0.35, 0);
      const noseMat = new StandardMaterial(`playerNoseMat${i}`, this.scene);
      noseMat.diffuseColor = new Color3(1, 0.85, 0.2);
      nose.material = noseMat;
      nose.parent = body;
      this.shadows?.addShadowCaster(body, true);
      this.playerMeshes.push(body);
    }
  }

  /** Update meshes and camera from the sim state, interpolating between ticks. */
  sync(world: WorldState, alpha: number, frameSeconds: number): void {
    this.ensurePlayerMeshes(world.players.length);
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i]!;
      const mesh = this.playerMeshes[i]!;
      mesh.position.set(p.prevX + (p.x - p.prevX) * alpha, PLAYER_HEIGHT_VISUAL / 2, p.prevY + (p.y - p.prevY) * alpha);
      // Sim heading is CCW in the (x, y) plane; Babylon's Y rotation is CW seen from above.
      mesh.rotation.y = -lerpAngle(p.prevHeading, p.heading, alpha);
    }
    const f = world.players[this.followPlayer];
    const followed = this.playerMeshes[this.followPlayer];
    if (f && followed) this.tvCamera.update(followed.position.x, followed.position.z, f.vx, f.vy, frameSeconds);
  }

  render(): void {
    this.scene.render();
  }

  private instrumentation: SceneInstrumentation | null = null;

  /** Render counters for the performance budget (docs/04). Instrumentation starts on first call. */
  renderStats(): { drawCalls: number; triangles: number; activeMeshes: number; width: number; height: number } {
    this.instrumentation ??= new SceneInstrumentation(this.scene);
    return {
      drawCalls: this.instrumentation.drawCallsCounter.current,
      triangles: Math.round(this.scene.getActiveIndices() / 3),
      activeMeshes: this.scene.getActiveMeshes().length,
      width: this.engine.getRenderWidth(),
      height: this.engine.getRenderHeight(),
    };
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
