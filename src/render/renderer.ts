import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import '@babylonjs/core/Engines/Extensions/engine.query';
import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { BALL_RADIUS, type WorldState } from '../sim/world';
import { RINK } from '../config/rink';
import { TUNING } from '../config/tuning';
import { buildRink } from './rinkBuilder';

/** Reception ring colours by outcome (src/sim/receive.ts order). */
const RECEPTION_COLORS = ['rgba(70,230,100,1)', 'rgba(255,225,60,1)', 'rgba(255,140,30,1)', 'rgba(255,60,60,1)'];
import { CameraRig } from './cameraRig';
import type { CameraContext, CameraPresetId } from './cameraPresets';

const PLAYER_RADIUS_VISUAL = 0.35;
/** Stick geometry in the body's local frame (+x forward, −z right, origin at mid-height). */
const STICK_HAND = new Vector3(0.12, 0.12, -0.3);
const STICK_REST = new Vector3(0.55, -0.84, -0.22);
/** Longest reach of the blade from the hand (m, body-local): arm + stick. */
const STICK_REACH = 1.35;
/** A loose ball in the air this close to a player (m, horizontal) and this high above the floor
 * (m) draws his blade to it (F1.5e: a remate en el aire or a high ball blocked is seen at its height). */
const REACH_DISTANCE = 1.2;
const REACH_MIN_HEIGHT = 0.12;
const REACH_MAX_HEIGHT = 1.6;
/** Time constant (s) of the drawn drop of a ball taken down from the air onto the stick. */
const BALL_DROP_TIME = 0.06;

interface StickRig {
  pivot: TransformNode;
  shaft: Mesh;
  blade: Mesh;
  /** Current blade point (body-local), smoothed towards its target. */
  heel: Vector3;
}
const PLAYER_HEIGHT_VISUAL = 1.75;
/** Shot reticle colour by kind: white = low, orange = high, purple = chip (as the TIRO arc). */
const RETICLE_COLORS = ['rgba(255,255,255,1)', 'rgba(245,178,60,1)', 'rgba(177,108,255,1)'];
/** Pass arrow colour by kind: white = ground, orange = driven lofted, purple = lob (as the PASE arc). */
const ARROW_COLORS = [new Color3(1, 1, 1), new Color3(0.96, 0.7, 0.24), new Color3(0.69, 0.42, 1)];
/** Placeholder shirt numbers by player index (until teams/rosters arrive in F2). */
const SHIRT_NUMBERS = [7, 4, 9, 10, 5, 2, 3, 6, 8, 11];

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
  private readonly sticks: StickRig[] = [];
  private readonly tmpVec = new Vector3();
  /** The ball's simulated position this frame (render coordinates, not enlarged): what sticks reach for. */
  private readonly ballSim = new Vector3();
  private readonly tmpVec2 = new Vector3();
  /** Drawn height of the ball last frame, and how far above its sim height it is drawn now (m). */
  private lastBallY = 0;
  private ballDrop = 0;
  private readonly ballMesh: Mesh;
  private readonly ballMarker: Mesh;
  /** The ball seen through whatever hides it (drawn only where something is in front of it). */
  private readonly ballGhost: Mesh;
  /** Bright ring on the floor under the player the human controls. */
  private readonly controlRing: Mesh;
  /** Ring under the teammate the controlled player's pass would go to (assist target). */
  private readonly targetRing: Mesh;
  /** Short ring under a player after he receives the ball, one per outcome (F1.4c):
   * green clean, yellow heavy touch, orange rebound, red miss. */
  private readonly receptionRings: Mesh[];
  private receptionShown = -1;
  /** Wall pass markers on the floor (F1.4d): where the ball will hit the board / where you meet it. */
  private readonly wallRing: Mesh;
  private readonly meetRing: Mesh;
  /** Shirt number floating above each player's head (always facing the camera). */
  private readonly numberLabels: Mesh[] = [];
  /** Arrow on the floor showing the pass while PASE is held (and a moment after it leaves). */
  private readonly arrow: { root: TransformNode; shaft: Mesh; head: Mesh; mat: StandardMaterial };
  /** Player setting: draw the pass arrow. */
  showPassArrow = true;
  /** Aim reticle on the goal mouth (F1.5a), one per shot kind (white low, orange high, purple
   * chip, as the TIRO arc): where the shot would cross the goal line. */
  private readonly reticles: Mesh[];
  private reticleShown = -1;
  /** Player setting: draw the shot reticle. */
  showShotReticle = true;

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
    this.ballGhost = this.createBallGhost();
    this.controlRing = this.createRing('controlRing', 'rgba(255,214,40,0.95)', 0.62, 12);
    this.targetRing = this.createRing('targetRing', 'rgba(110,235,255,1)', 0.6, 14);
    this.receptionRings = RECEPTION_COLORS.map((c, i) => {
      const ring = this.createRing(`receptionRing${i}`, c, 0.85, 10);
      ring.isVisible = false;
      return ring;
    });
    this.wallRing = this.createRing('wallRing', 'rgba(255,170,40,1)', 0.8, 12);
    this.meetRing = this.createRing('meetRing', 'rgba(120,255,160,1)', 0.7, 12);
    this.wallRing.isVisible = this.meetRing.isVisible = false;
    this.arrow = this.createPassArrow();
    this.reticles = RETICLE_COLORS.map((c, i) => this.createReticle(`shotReticle${i}`, c));
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
      this.sticks.push(this.createStick(i, body));
      this.numberLabels.push(this.createNumberLabel(i));
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

  /**
   * Silhouette of the ball through the near board (v0.1.19). A copy of the ball, slightly
   * bigger, that is drawn only where the depth buffer already holds something NEARER than it
   * (depth function GREATER): so it shows where the board (or a player) hides the ball and is
   * invisible when the ball is in view. One extra draw call, no per-frame cost besides that.
   */
  private createBallGhost(): Mesh {
    const ghost = CreateSphere('ballGhost', { diameter: BALL_RADIUS * 2, segments: 12 }, this.scene);
    const mat = new StandardMaterial('ballGhostMat', this.scene);
    mat.diffuseColor = new Color3(1, 0.8, 0.35);
    mat.emissiveColor = new Color3(1, 0.8, 0.35);
    mat.disableLighting = true;
    mat.depthFunction = Constants.GREATER;
    mat.disableDepthWrite = true;
    mat.alpha = TUNING.ball.ghostOpacity;
    ghost.material = mat;
    ghost.isPickable = false;
    ghost.isVisible = false;
    return ghost;
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

  /** Ring on the floor: yellow for the controlled player (FIFA-like), cyan for the pass target. */
  private createRing(name: string, color: string, radius: number, width: number): Mesh {
    const disc = CreateDisc(name, { radius, tessellation: 32 }, this.scene);
    disc.rotation.x = Math.PI / 2;
    const tex = new DynamicTexture(`${name}Tex`, { width: 128, height: 128 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.stroke();
    tex.update();
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`${name}Mat`, this.scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    disc.material = mat;
    disc.isPickable = false;
    return disc;
  }

  /** Shot reticle (F1.5a): a ring with a dot and four ticks, upright on the goal line (radius 1, scaled per frame). */
  private createReticle(name: string, color: string): Mesh {
    const disc = CreateDisc(name, { radius: 1, tessellation: 24 }, this.scene);
    // Upright, facing along the rink (Babylon x).
    disc.rotation.y = Math.PI / 2;
    const tex = new DynamicTexture(`${name}Tex`, { width: 128, height: 128 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(64, 64, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 64, 10, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y, w, h] of [[58, 0, 12, 22], [58, 106, 12, 22], [0, 58, 22, 12], [106, 58, 22, 12]] as const) ctx.fillRect(x, y, w, h);
    tex.update();
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`${name}Mat`, this.scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    disc.material = mat;
    disc.isPickable = false;
    disc.isVisible = false;
    return disc;
  }

  /**
   * Flat arrow on the floor (unit length along +x, unit width): a shaft and a triangular head,
   * both unlit and drawn without shadows. Scaled and coloured every frame; 2 draw calls.
   */
  private createPassArrow(): { root: TransformNode; shaft: Mesh; head: Mesh; mat: StandardMaterial } {
    const root = new TransformNode('passArrow', this.scene);
    const mat = new StandardMaterial('passArrowMat', this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.alpha = 0.85;
    mat.backFaceCulling = false;
    const shaft = CreatePlane('passArrowShaft', { size: 1 }, this.scene);
    shaft.rotation.x = Math.PI / 2;
    shaft.parent = root;
    shaft.material = mat;
    shaft.isPickable = false;
    const head = CreateDisc('passArrowHead', { radius: 1, tessellation: 3 }, this.scene);
    head.rotation.x = Math.PI / 2;
    head.parent = root;
    head.material = mat;
    head.isPickable = false;
    root.setEnabled(false);
    return { root, shaft, head, mat };
  }

  /** Place the pass arrow: from (x, z) towards `angle` (sim CCW), for a launch `speed` of `kind`. */
  private syncPassArrow(world: WorldState, dt: number): void {
    const a = this.arrow;
    const k = TUNING.passArrow;
    let fromX = 0;
    let fromZ = 0;
    let angle = 0;
    let speed = 0;
    let kind = 0;
    let fade = 1;
    const controlled = this.playerMeshes[world.controlled];
    if (world.aimActive && controlled) {
      fromX = controlled.position.x;
      fromZ = controlled.position.z;
      angle = world.aimPlan.angle;
      speed = world.aimPlan.speed;
      kind = world.aimPlan.kind;
    } else {
      const age = (world.tick - world.lastPassTick) * dt;
      if (age < 0 || age > k.afterTime) {
        a.root.setEnabled(false);
        return;
      }
      fromX = world.lastPassX;
      fromZ = world.lastPassY;
      angle = world.lastPassAngle;
      speed = world.lastPassSpeed;
      kind = world.lastPassKind;
      fade = 1 - age / Math.max(0.01, k.afterTime);
    }
    if (!this.showPassArrow) {
      a.root.setEnabled(false);
      return;
    }
    a.root.setEnabled(true);
    const len = k.minLength + (k.maxLength - k.minLength) * Math.min(1, Math.max(0, speed / Math.max(1, k.fullSpeed)));
    const headLen = Math.min(len * 0.4, k.width * 2.6);
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    a.root.position.set(fromX + c * k.startOffset, 0.012, fromZ + sn * k.startOffset);
    a.root.rotation.y = -angle;
    // Shaft from 0 to len − head, head triangle pointing along +x at the end.
    a.shaft.scaling.set(len - headLen, k.width, 1);
    a.shaft.position.set((len - headLen) / 2, 0, 0);
    a.head.scaling.set(headLen * 0.67, k.width * 1.5, 1);
    a.head.position.set(len - headLen * 0.67, 0, 0);
    const col = ARROW_COLORS[kind] ?? ARROW_COLORS[0]!;
    a.mat.emissiveColor.copyFrom(col);
    a.mat.alpha = 0.85 * fade;
  }

  /** Shirt number above the head (placeholder until real kits in F4). */
  private createNumberLabel(i: number): Mesh {
    const plane = CreatePlane(`playerNumber${i}`, { size: 0.55 }, this.scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const tex = new DynamicTexture(`playerNumberTex${i}`, { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 64, 64);
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    const label = String(SHIRT_NUMBERS[i % SHIRT_NUMBERS.length]);
    ctx.strokeText(label, 32, 34);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 32, 34);
    tex.update();
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`playerNumberMat${i}`, this.scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.disableLighting = true;
    plane.material = mat;
    plane.isPickable = false;
    return plane;
  }

  /**
   * Placeholder rink-hockey stick, held in the right hand: a shaft pivoting at the hand
   * and a flat blade at its end. `syncStick` points it at the ball while dribbling.
   */
  private createStick(i: number, body: Mesh): StickRig {
    const mat = new StandardMaterial(`stickMat${i}`, this.scene);
    mat.diffuseColor = new Color3(0.9, 0.8, 0.6);
    mat.emissiveColor = new Color3(0.2, 0.18, 0.12);
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    const pivot = new TransformNode(`stickPivot${i}`, this.scene);
    pivot.parent = body;
    pivot.position.copyFrom(STICK_HAND);
    pivot.rotationQuaternion = new Quaternion();
    // Unit-length shaft along +x, scaled to the hand→blade distance every frame.
    const shaft = CreateCylinder(`stickShaft${i}`, { height: 1, diameter: 0.05, tessellation: 6 }, this.scene);
    shaft.bakeTransformIntoVertices(Matrix.RotationZ(-Math.PI / 2).multiply(Matrix.Translation(0.5, 0, 0)));
    shaft.parent = pivot;
    shaft.material = mat;
    shaft.isPickable = false;
    const blade = CreateBox(`stickBlade${i}`, { width: 0.3, height: 0.05, depth: 0.07 }, this.scene);
    blade.parent = body;
    blade.material = mat;
    blade.isPickable = false;
    const rig: StickRig = { pivot, shaft, blade, heel: STICK_REST.clone() };
    this.applyStick(rig);
    return rig;
  }

  /** Place shaft and blade for the current `heel` point (body-local coordinates). */
  private applyStick(rig: StickRig): void {
    const v = rig.heel.subtract(STICK_HAND);
    const len = v.length();
    Quaternion.FromUnitVectorsToRef(Vector3.Right(), v.scaleInPlace(1 / len), rig.pivot.rotationQuaternion!);
    rig.shaft.scaling.x = len;
    rig.blade.position.copyFrom(rig.heel);
    rig.blade.position.y = Math.max(rig.heel.y, -0.84);
    // Blade lies flat on the floor, pointing the way the shaft reaches.
    rig.blade.rotation.y = -Math.atan2(rig.heel.z - STICK_HAND.z, rig.heel.x - STICK_HAND.x);
  }

  /**
   * While carrying the ball the blade follows it (behind the ball, on the floor); a loose ball in
   * the air close to him draws it to the ball's height (`reach`: F1.5e); otherwise it returns to
   * the rest pose. Smoothed so it never snaps.
   */
  private syncStick(rig: StickRig, owns: boolean, heading: number, px: number, pz: number, dt: number, reach = false): void {
    const target = this.tmpVec;
    if (reach) {
      const b = this.ballSim;
      const dx = b.x - px;
      const dz = b.z - pz;
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      // Body-local: x forward, y up from the body's centre, z to his left.
      target.set(dx * c + dz * s - 0.07, b.y - PLAYER_HEIGHT_VISUAL / 2, -(dx * s - dz * c));
      target.y = Math.max(-0.84, target.y);
      const off = target.subtractToRef(STICK_HAND, this.tmpVec2);
      const len = off.length();
      if (len > STICK_REACH) off.scaleInPlace(STICK_REACH / len).addToRef(STICK_HAND, target);
    } else if (owns) {
      const b = this.ballMesh.position;
      const dx = b.x - px;
      const dz = b.z - pz;
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      const forward = dx * c + dz * s;
      const right = dx * s - dz * c;
      // Blade just behind the ball (towards the hand), on the floor.
      target.set(forward - 0.07, -0.84, -right);
    } else {
      target.copyFrom(STICK_REST);
    }
    const k = 1 - Math.exp(-dt / 0.05);
    rig.heel.addInPlace(target.subtractInPlace(rig.heel).scaleInPlace(k));
    this.applyStick(rig);
  }

  /** Update meshes and camera from the sim state, interpolating between ticks. */
  sync(world: WorldState, alpha: number, frameSeconds: number): void {
    this.ensurePlayerMeshes(world.players.length);
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i]!;
      const mesh = this.playerMeshes[i]!;
      mesh.position.set(p.prevX + (p.x - p.prevX) * alpha, PLAYER_HEIGHT_VISUAL / 2, p.prevY + (p.y - p.prevY) * alpha);
      // Sim heading is CCW in the (x, y) plane; Babylon's Y rotation is CW seen from above.
      const heading = lerpAngle(p.prevHeading, p.heading, alpha);
      mesh.rotation.y = -heading;
      this.numberLabels[i]!.position.set(mesh.position.x, PLAYER_HEIGHT_VISUAL + 0.35, mesh.position.z);
    }
    const controlled = this.playerMeshes[world.controlled];
    this.controlRing.isVisible = Boolean(controlled) && world.players.length > 1;
    if (controlled) this.controlRing.position.set(controlled.position.x, 0.008, controlled.position.z);
    this.syncPassArrow(world, 1 / TUNING.sim.tickRate);
    const target = this.playerMeshes[world.aimTarget];
    this.targetRing.isVisible = Boolean(target) && TUNING.assist.targetRing >= 0.5;
    if (target) this.targetRing.position.set(target.position.x, 0.007, target.position.z);
    this.syncReceptionRing(world);
    this.syncWallMarkers(world);
    this.syncShotReticle(world);
    // Ball: interpolated and drawn bigger than real so it reads on a phone. The size is
    // compensated by the distance to the camera (last frame's pose) and multiplied by the
    // current camera's own factor; never smaller than the real ball.
    const b = world.ball;
    const bx = b.prevX + (b.x - b.prevX) * alpha;
    const by = b.prevZ + (b.z - b.prevZ) * alpha;
    const bz = b.prevY + (b.y - b.prevY) * alpha;
    const cam = this.cameraRig.camera.position;
    const camDist = Math.hypot(cam.x - bx, cam.y - by, cam.z - bz);
    const k = TUNING.ball;
    const sizeFactor = (camDist / k.visualRefDistance) * this.cameraRig.ballScale;
    const scale = Math.max(1, k.visualScale * sizeFactor);
    this.ballMesh.scaling.setAll(scale);
    // A pass taken down from the air (F1.5e) is on the stick at once in the sim: draw it dropping.
    if (b.owner >= 0 && this.lastBallY - by > 0.15) this.ballDrop = this.lastBallY - by;
    else if (b.owner < 0) this.ballDrop = 0;
    this.ballDrop *= Math.exp(-frameSeconds / BALL_DROP_TIME);
    this.lastBallY = by + this.ballDrop;
    this.ballMesh.position.set(bx, by + this.ballDrop + BALL_RADIUS * (scale - 1), bz);
    // Silhouette through the near board: only close to it (the board is the −z side).
    const ghost = this.ballGhost;
    const nearBoard = bz + RINK.width / 2;
    ghost.isVisible = k.ghost >= 0.5 && nearBoard < k.ghostDistance;
    if (ghost.isVisible) {
      ghost.scaling.setAll(scale * Math.max(1.05, k.ghostSize));
      ghost.position.copyFrom(this.ballMesh.position);
      (ghost.material as StandardMaterial).alpha = k.ghostOpacity;
    }
    const mr = k.markerRadius * Math.max(0.5, sizeFactor);
    this.ballMarker.isVisible = mr > 0;
    if (mr > 0) {
      // Grows and fades with height so it also tells how high the ball is.
      const lift = Math.max(0, by - BALL_RADIUS);
      this.ballMarker.scaling.setAll(mr * (1 + lift * 0.8));
      this.ballMarker.visibility = 1 / (1 + lift * 1.5);
      this.ballMarker.position.set(bx, 0.006, bz);
    }

    // Sticks follow the ball while dribbling (after the ball mesh has its new position), and reach
    // for a loose ball in the air next to the player (its real position, not the drawn one).
    this.ballSim.set(bx, by, bz);
    const h = by - BALL_RADIUS;
    const high = b.owner < 0 && h >= REACH_MIN_HEIGHT && h <= REACH_MAX_HEIGHT;
    for (let i = 0; i < world.players.length; i++) {
      const mesh = this.playerMeshes[i]!;
      const reach = high && Math.hypot(bx - mesh.position.x, bz - mesh.position.z) <= REACH_DISTANCE;
      this.syncStick(this.sticks[i]!, b.owner === i, -mesh.rotation.y, mesh.position.x, mesh.position.z, frameSeconds, reach);
    }

    // Camera: the active preset aims between the controlled player and the ball. When the
    // control switches to another player the rig's smoothing glides over (no cut).
    const f = world.players[world.controlled];
    const followed = this.playerMeshes[world.controlled];
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

  /** Is the pass arrow drawn right now, and its colour (for tests/debug). */
  /**
   * Wall pass markers (F1.4d): while aiming one (the arrow already points at the board), a ring
   * where the ball will hit it and one where you will meet it; they stay until it is back.
   */
  private syncWallMarkers(world: WorldState): void {
    const on = TUNING.wall.showMarkers >= 0.5;
    const aiming = world.aimActive && world.aimPlan.wall;
    const flying = world.wallFrom >= 0 || (world.wallBack >= 0 && world.passTo === world.wallBack);
    const show = on && (aiming || flying);
    this.wallRing.isVisible = this.meetRing.isVisible = show;
    if (!show) return;
    const wx = aiming ? world.aimPlan.wallX : world.wallX;
    const wy = aiming ? world.aimPlan.wallY : world.wallY;
    const mx = aiming ? world.aimPlan.meetX : world.meetX;
    const my = aiming ? world.aimPlan.meetY : world.meetY;
    this.wallRing.position.set(wx, 0.006, wy);
    this.meetRing.position.set(mx, 0.006, my);
  }

  /** Shot reticle (F1.5a): where the shot would cross the goal line, while carrying the ball near
   * the goal or charging; brighter while TIRO is held. */
  private syncShotReticle(world: WorldState): void {
    const show = this.showShotReticle && world.shotAimActive;
    const kind = show ? world.shotAim.kind : -1;
    this.reticleShown = kind;
    const me = world.players[world.controlled];
    const charging = Boolean(me) && me!.shotHold >= 0;
    const cam = this.cameraRig.camera.position;
    this.reticles.forEach((r, i) => {
      r.isVisible = i === kind;
      if (!r.isVisible) return;
      // Slightly in front of the goal line (towards the shooter) so the net never hides it; as
      // big as a ball drawn at that distance would be (readable from the TV camera), never
      // taller than the goal mouth.
      const side = world.shotAim.targetX > 0 ? 1 : -1;
      const x = world.shotAim.targetX - side * 0.05;
      const y = world.shotAim.targetZ;
      const z = world.shotAim.targetY;
      const k = TUNING.ball;
      const size = Math.max(1, (k.visualScale * Math.hypot(cam.x - x, cam.y - y, cam.z - z)) / k.visualRefDistance) * this.cameraRig.ballScale;
      const radius = Math.min(0.5, 0.16 * size);
      r.scaling.setAll(radius);
      r.position.set(x, Math.max(radius, y), z);
      r.visibility = charging ? 1 : 0.6;
    });
  }

  /** Shot reticle on screen: the kind it shows (0 low, 1 high, 2 chip), −1 = none (tests). */
  get shotReticleKind(): number {
    return this.reticleShown;
  }

  /** Wall pass markers on screen (tests/debug). */
  get wallMarkersVisible(): boolean {
    return this.wallRing.isVisible;
  }

  /** Reception feedback ring: shown for receive.feedbackTime after a reception, fading out. */
  private syncReceptionRing(world: WorldState): void {
    const r = TUNING.receive;
    const age = (world.tick - world.lastReceptionTick) / TUNING.sim.tickRate;
    const mesh = this.playerMeshes[world.lastReceptionPlayer];
    const show = r.showFeedback >= 0.5 && Boolean(mesh) && age >= 0 && age < r.feedbackTime;
    this.receptionShown = show ? world.lastReceptionOutcome : -1;
    this.receptionRings.forEach((ring, i) => {
      ring.isVisible = show && i === world.lastReceptionOutcome;
      if (!ring.isVisible || !mesh) return;
      ring.position.set(mesh.position.x, 0.009, mesh.position.z);
      ring.visibility = 1 - age / r.feedbackTime;
    });
  }

  /** Is the ball silhouette being drawn (tests/debug)? */
  get ballGhostVisible(): boolean {
    return this.ballGhost.isVisible;
  }

  /** Reception ring on screen: the outcome it shows (0 clean … 3 miss), −1 = none (tests). */
  get receptionFeedback(): number {
    return this.receptionShown;
  }

  get passArrowState(): { visible: boolean; r: number; g: number; b: number; length: number } {
    const a = this.arrow;
    const c = a.mat.emissiveColor;
    return { visible: a.root.isEnabled(), r: c.r, g: c.g, b: c.b, length: a.shaft.scaling.x + a.head.scaling.x * 1.5 };
  }

  /** Current on-screen ball scale (for tests/debug). */
  get ballVisualScale(): number {
    return this.ballMesh.scaling.x;
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
