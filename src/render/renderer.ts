import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { WorldState } from '../sim/world';

/**
 * Owns the Babylon engine and scene, and draws a WorldState interpolated by `alpha`.
 * Sim coordinates (x along length, y along width) map to Babylon (x, 0, z).
 */
export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private readonly playerMeshes: Mesh[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.04, 0.11, 0.2, 1);
    const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.0, 40, Vector3.Zero(), this.scene);
    camera.minZ = 0.5;
    new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    CreateGround('ground', { width: 40, height: 20 }, this.scene);
    window.addEventListener('resize', () => this.engine.resize());
  }

  private ensurePlayerMeshes(count: number): void {
    while (this.playerMeshes.length < count) {
      const mesh = CreateCapsule(`player${this.playerMeshes.length}`, { radius: 0.35, height: 1.75 }, this.scene);
      const mat = new StandardMaterial(`playerMat${this.playerMeshes.length}`, this.scene);
      mat.diffuseColor = new Color3(0.9, 0.2, 0.25);
      mesh.material = mat;
      this.playerMeshes.push(mesh);
    }
  }

  /** Update meshes from the sim state, interpolating between previous and current tick. */
  sync(world: WorldState, alpha: number): void {
    this.ensurePlayerMeshes(world.players.length);
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i]!;
      const mesh = this.playerMeshes[i]!;
      mesh.position.set(p.prevX + (p.x - p.prevX) * alpha, 0.875, p.prevY + (p.y - p.prevY) * alpha);
      mesh.rotation.y = -lerpAngle(p.prevHeading, p.heading, alpha);
    }
  }

  render(): void {
    this.scene.render();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
