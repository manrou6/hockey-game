import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import '@babylonjs/core/Engines/Extensions/engine.query';
import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { BALL_RADIUS, type WorldState } from '../sim/world';
import { TUNING } from '../config/tuning';
import { buildRink } from './rinkBuilder';
import { CameraRig } from './cameraRig';
import type { CameraContext, CameraPresetId } from './cameraPresets';

const PLAYER_RADIUS_VISUAL = 0.35;
const PLAYER_HEIGHT_VISUAL = 1.75;

/**
 * Owns the Babylon engine and scene, and draws a WorldState interpolated by `alpha`.
 * Sim coordinates (x along length, y along width) map to Babylon (x, 0, z).
 */
export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly cameraRig: CameraRig;
  private readonly camCtx: CameraContext = { playerX: 0, playerZ: 0, playerVx: 0, playerVz: 0, ballX: 0, ballZ: 0, ballVx: 0, ballVz: 0, dt: 0 };
  private shadows: ShadowGenerator | null = null;
  private readonly keyLight: DirectionalLight;
  private quality: QualityLevel;
  private readonly playerMeshes: Mesh[] = [];
  private readonly ballMesh: Mesh;
  private readonly ballMarker: Mesh;
  /** Index of the player the TV camera follows (until there is a ball). */
  followPlayer = 0;

  constructor(canvas: HTMLCanvasElement, quality: QualityLevel, cameraPreset: CameraPresetId = 'tv') {
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
    this.ballMesh = this.createBallMesh();
    this.ballMarker = this.createBallMarker();
    this.cameraRig = new CameraRig(this.scene, cameraPreset);
    this.scene.activeCamera = this.cameraRig.camera;
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
      this.createStick(i).parent = body;
      this.shadows?.addShadowCaster(body, true);
      this.playerMeshes.push(body);
    }
  }

  private createBallMesh(): Mesh {
    const ball = CreateSphere('ball', { diameter: BALL_RADIUS * 2, segments: 12 }, this.scene);
    const mat = new StandardMaterial('ballMat', this.scene);
    mat.diffuseColor = new Color3(1, 0.5, 0.08);
    mat.emissiveColor = new Color3(0.35, 0.15, 0.02);
    mat.specularColor = new Color3(0.5, 0.5, 0.5);
    ball.material = mat;
    ball.isPickable = false;
    this.shadows?.addShadowCaster(ball);
    return ball;
  }

  /** Soft disc on the floor under the ball (readability; fades as the ball rises). */
  private createBallMarker(): Mesh {
    const disc = CreateDisc('ballMarker', { radius: 1, tessellation: 24 }, this.scene);
    disc.rotation.x = Math.PI / 2;
    const tex = new DynamicTexture('ballMarkerTex', { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    tex.update();
    tex.hasAlpha = true;
    const mat = new StandardMaterial('ballMarkerMat', this.scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    disc.material = mat;
    disc.isPickable = false;
    return disc;
  }

  /** Placeholder rink-hockey stick (shaft + curved blade), held on the right side. */
  private createStick(i: number): Mesh {
    // Local frame of the body: +x forward, -z right, origin at mid-height (0.875 m).
    const bar = (a: Vector3, b: Vector3, d: number): Mesh => {
      const c = CreateCylinder('stickPart', { height: Vector3.Distance(a, b), diameter: d, tessellation: 6 }, this.scene);
      c.position = a.add(b).scale(0.5);
      c.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), b.subtract(a).normalize(), new Quaternion());
      return c;
    };
    const hand = new Vector3(0.12, 0.12, -0.3);
    const heel = new Vector3(0.48, -0.82, -0.26);
    const toe = new Vector3(0.74, -0.84, -0.18);
    const stick = Mesh.MergeMeshes([bar(hand, heel, 0.05), bar(heel, toe, 0.07)], true) as Mesh;
    stick.name = `stick${i}`;
    const mat = new StandardMaterial(`stickMat${i}`, this.scene);
    mat.diffuseColor = new Color3(0.9, 0.8, 0.6);
    mat.emissiveColor = new Color3(0.2, 0.18, 0.12);
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    stick.material = mat;
    stick.isPickable = false;
    return stick;
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
    // Ball: interpolated, drawn slightly bigger (tunable) with its bottom on the floor.
    const b = world.ball;
    const scale = TUNING.ball.visualScale;
    const by = b.prevZ + (b.z - b.prevZ) * alpha;
    this.ballMesh.scaling.setAll(scale);
    this.ballMesh.position.set(b.prevX + (b.x - b.prevX) * alpha, by + BALL_RADIUS * (scale - 1), b.prevY + (b.y - b.prevY) * alpha);
    const mr = TUNING.ball.markerRadius;
    this.ballMarker.isVisible = mr > 0;
    if (mr > 0) {
      // Grows and fades with height so it also tells how high the ball is.
      const lift = Math.max(0, by - BALL_RADIUS);
      this.ballMarker.scaling.setAll(mr * (1 + lift * 0.8));
      this.ballMarker.visibility = 1 / (1 + lift * 1.5);
      this.ballMarker.position.set(this.ballMesh.position.x, 0.006, this.ballMesh.position.z);
    }

    // Camera: the active preset aims between the controlled player and the ball.
    const f = world.players[this.followPlayer];
    const followed = this.playerMeshes[this.followPlayer];
    if (f && followed) {
      const c = this.camCtx;
      c.playerX = followed.position.x;
      c.playerZ = followed.position.z;
      c.playerVx = f.vx;
      c.playerVz = f.vy;
      c.ballX = this.ballMesh.position.x;
      c.ballZ = this.ballMesh.position.z;
      c.ballVx = b.vx;
      c.ballVz = b.vy;
      c.dt = frameSeconds;
      this.cameraRig.update(c);
    }
  }

  render(): void {
    this.scene.render();
  }

  /** Project a world point (Babylon coords) to CSS pixels in the landscape layout. */
  projectToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    const p = Vector3.Project(new Vector3(x, y, z), Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), this.cameraRig.camera.viewport.toGlobal(w, h));
    const ratio = 1 / this.engine.getHardwareScalingLevel();
    return { x: p.x / ratio, y: p.y / ratio };
  }

  private instrumentation: SceneInstrumentation | null = null;
  private gpuInstrumentation: EngineInstrumentation | null = null;
  private gpuUnavailable = false;

  /** Render counters for the performance budget (docs/04). Instrumentation starts on first call. */
  renderStats(): {
    drawCalls: number;
    triangles: number;
    activeMeshes: number;
    width: number;
    height: number;
    /** Render pixels per CSS pixel actually used, and the device's native ratio. */
    pixelRatio: number;
    nativePixelRatio: number;
    /** GPU time per frame (ms) if the device exposes timer queries, else null. */
    gpuMs: number | null;
  } {
    this.instrumentation ??= new SceneInstrumentation(this.scene);
    if (!this.gpuInstrumentation && !this.gpuUnavailable && this.engine.getCaps().timerQuery) {
      try {
        this.gpuInstrumentation = new EngineInstrumentation(this.engine);
        this.gpuInstrumentation.captureGPUFrameTime = true;
      } catch {
        // GPU timing is a debug nicety; never let it break the frame.
        this.gpuUnavailable = true;
        this.gpuInstrumentation = null;
      }
    }
    const gpuAvg = this.gpuInstrumentation?.gpuFrameTimeCounter.lastSecAverage ?? 0;
    return {
      drawCalls: this.instrumentation.drawCallsCounter.current,
      triangles: Math.round(this.scene.getActiveIndices() / 3),
      activeMeshes: this.scene.getActiveMeshes().length,
      width: this.engine.getRenderWidth(),
      height: this.engine.getRenderHeight(),
      pixelRatio: 1 / this.engine.getHardwareScalingLevel(),
      nativePixelRatio: window.devicePixelRatio || 1,
      gpuMs: gpuAvg > 0 ? gpuAvg * 1e-6 : null,
    };
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
