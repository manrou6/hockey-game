import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { RINK } from '../config/rink';
import { createRinkFloorTexture } from './rinkTexture';

/** Static meshes of the rink. Everything here is frozen after creation (no per-frame cost). */
export interface RinkMeshes {
  floor: Mesh;
  boards: Mesh;
  goalFrames: Mesh;
  goalNets: Mesh;
  surroundings: Mesh;
}

export function buildRink(scene: Scene): RinkMeshes {
  const floor = buildFloor(scene);
  const boards = buildBoards(scene);
  const { frames, nets } = buildGoals(scene);
  const surroundings = buildSurroundings(scene);
  for (const m of [floor, boards, frames, nets, surroundings]) {
    m.freezeWorldMatrix();
    m.isPickable = false;
    m.material?.freeze();
  }
  return { floor, boards, goalFrames: frames, goalNets: nets, surroundings };
}

function buildFloor(scene: Scene): Mesh {
  const floor = CreateGround('rinkFloor', { width: RINK.length, height: RINK.width }, scene);
  const mat = new StandardMaterial('rinkFloorMat', scene);
  mat.diffuseTexture = createRinkFloorTexture(scene);
  mat.specularColor = new Color3(0.25, 0.25, 0.25);
  mat.specularPower = 48;
  floor.material = mat;
  floor.receiveShadows = true;
  return floor;
}

/** Points along the rounded-rectangle board line (CCW), with outward normals. */
function boardPath(segmentsPerCorner: number): { x: number; z: number; nx: number; nz: number }[] {
  const r = RINK.cornerRadius;
  const hx = RINK.length / 2 - r;
  const hz = RINK.width / 2 - r;
  const corners: [number, number, number][] = [
    [hx, hz, 0],
    [-hx, hz, Math.PI / 2],
    [-hx, -hz, Math.PI],
    [hx, -hz, (Math.PI * 3) / 2],
  ];
  const pts: { x: number; z: number; nx: number; nz: number }[] = [];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= segmentsPerCorner; i++) {
      const a = a0 + (i / segmentsPerCorner) * (Math.PI / 2);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      pts.push({ x: cx + nx * r, z: cz + nz * r, nx, nz });
    }
  }
  return pts;
}

/** One mesh: inner face (white), top cap (team-neutral navy), outer face (grey). */
function buildBoards(scene: Scene): Mesh {
  const path = boardPath(10);
  const h = RINK.boardHeight;
  const t = RINK.boardThickness;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const strip = (
    a: (p: (typeof path)[number]) => [number, number, number],
    b: (p: (typeof path)[number]) => [number, number, number],
    normal: (p: (typeof path)[number]) => [number, number, number],
    color: [number, number, number],
  ): void => {
    const base = positions.length / 3;
    for (const p of path) {
      positions.push(...a(p), ...b(p));
      const n = normal(p);
      normals.push(...n, ...n);
      colors.push(...color, 1, ...color, 1);
    }
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = base + i * 2;
      const b0 = a0 + 1;
      const a1 = base + j * 2;
      const b1 = a1 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  };

  strip((p) => [p.x, 0, p.z], (p) => [p.x, h, p.z], (p) => [-p.nx, 0, -p.nz], [0.96, 0.96, 0.97]);
  strip((p) => [p.x, h, p.z], (p) => [p.x + p.nx * t, h, p.z + p.nz * t], () => [0, 1, 0], [0.08, 0.16, 0.3]);
  strip((p) => [p.x + p.nx * t, h, p.z + p.nz * t], (p) => [p.x + p.nx * t, 0, p.z + p.nz * t], (p) => [p.nx, 0, p.nz], [0.35, 0.38, 0.42]);
  // Thin dark kick-strip at the bottom of the inner face (reads like real rink boards).
  strip((p) => [p.x - p.nx * 0.002, 0, p.z - p.nz * 0.002], (p) => [p.x - p.nx * 0.002, 0.12, p.z - p.nz * 0.002], (p) => [-p.nx, 0, -p.nz], [0.12, 0.14, 0.18]);

  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.indices = indices;
  const mesh = new Mesh('boards', scene);
  vd.applyToMesh(mesh);
  const mat = new StandardMaterial('boardsMat', scene);
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0.15, 0.15, 0.15);
  // Boards read as bright white from the TV camera even when facing away from the key light.
  mat.emissiveColor = new Color3(0.3, 0.3, 0.3);
  mesh.material = mat;
  mesh.useVertexColors = true;
  mesh.receiveShadows = true;
  return mesh;
}

function buildGoals(scene: Scene): { frames: Mesh; nets: Mesh } {
  const frameParts: Mesh[] = [];
  const netPositions: number[] = [];
  const netUvs: number[] = [];
  const netIndices: number[] = [];
  const pr = RINK.goalPostDiameter / 2;
  const hw = RINK.goalWidth / 2 + pr;
  const gh = RINK.goalHeight + pr;

  const bar = (a: Vector3, b: Vector3): void => {
    const len = Vector3.Distance(a, b);
    const c = CreateCylinder('goalBar', { height: len, diameter: RINK.goalPostDiameter, tessellation: 10 }, scene);
    c.position = a.add(b).scale(0.5);
    // Align the cylinder's local Y axis with the bar direction.
    c.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), b.subtract(a).normalize(), new Quaternion());
    frameParts.push(c);
  };

  const quad = (p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3): void => {
    const base = netPositions.length / 3;
    for (const p of [p0, p1, p2, p3]) netPositions.push(p.x, p.y, p.z);
    // UVs in metres so the mesh texture tiles at a constant cell size.
    const u = Vector3.Distance(p0, p1);
    const v = Vector3.Distance(p0, p3);
    netUvs.push(0, 0, u, 0, u, v, 0, v);
    netIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (const side of [-1, 1] as const) {
    const gx = side * (RINK.length / 2 - RINK.goalLineFromEnd) + side * pr;
    const bx = gx + side * RINK.goalDepthBottom;
    const tx = gx + side * RINK.goalDepthTop;
    const P = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
    // Front: posts + crossbar.
    bar(P(gx, 0, -hw), P(gx, gh, -hw));
    bar(P(gx, 0, hw), P(gx, gh, hw));
    bar(P(gx, gh, -hw), P(gx, gh, hw));
    // Top depth bars and slanted back posts.
    bar(P(gx, gh, -hw), P(tx, gh, -hw));
    bar(P(gx, gh, hw), P(tx, gh, hw));
    bar(P(tx, gh, -hw), P(bx, pr, -hw));
    bar(P(tx, gh, hw), P(bx, pr, hw));
    bar(P(tx, gh, -hw), P(tx, gh, hw));
    // Floor frame.
    bar(P(gx, pr, -hw), P(bx, pr, -hw));
    bar(P(gx, pr, hw), P(bx, pr, hw));
    bar(P(bx, pr, -hw), P(bx, pr, hw));
    // Net panels: top, back (slanted), two sides.
    quad(P(gx, gh, -hw), P(gx, gh, hw), P(tx, gh, hw), P(tx, gh, -hw));
    quad(P(tx, gh, -hw), P(tx, gh, hw), P(bx, 0, hw), P(bx, 0, -hw));
    for (const z of [-hw, hw]) {
      quad(P(gx, 0, z), P(bx, 0, z), P(tx, gh, z), P(gx, gh, z));
    }
  }

  const frames = Mesh.MergeMeshes(frameParts, true, true) as Mesh;
  frames.name = 'goalFrames';
  const frameMat = new StandardMaterial('goalFrameMat', scene);
  frameMat.diffuseColor = new Color3(0.9, 0.25, 0.12);
  frameMat.specularColor = new Color3(0.4, 0.4, 0.4);
  frames.material = frameMat;

  const nets = new Mesh('goalNets', scene);
  const vd = new VertexData();
  vd.positions = netPositions;
  vd.uvs = netUvs;
  vd.indices = netIndices;
  const nrm: number[] = [];
  VertexData.ComputeNormals(netPositions, netIndices, nrm);
  vd.normals = nrm;
  vd.applyToMesh(nets);
  const netMat = new StandardMaterial('goalNetMat', scene);
  netMat.diffuseTexture = createNetTexture(scene);
  netMat.diffuseTexture.hasAlpha = true;
  netMat.useAlphaFromDiffuseTexture = true;
  netMat.backFaceCulling = false;
  netMat.specularColor = Color3.Black();
  netMat.emissiveColor = new Color3(0.35, 0.35, 0.35);
  nets.material = netMat;
  return { frames, nets };
}

/** 1 texture repeat = 1 m; 10 cm mesh cells. */
function createNetTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('netTex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  const cell = size / 10;
  for (let i = 0; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  tex.update(true);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Hall floor around the rink and simple tiered stands (placeholder until F4). */
function buildSurroundings(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  const hall = CreateGround('hallFloor', { width: RINK.length + 30, height: RINK.width + 30 }, scene);
  hall.position.y = -0.01;
  parts.push(hall);
  const tiers = 6;
  const tierDepth = 0.9;
  const tierRise = 0.45;
  const gap = 3.5;
  for (let i = 0; i < tiers; i++) {
    const y = 0.6 + i * tierRise;
    const off = gap + i * tierDepth;
    // Long sides.
    for (const s of [-1, 1]) {
      const b = CreateBox('stand', { width: RINK.length + 2 * off, height: y * 2, depth: tierDepth }, scene);
      b.position.set(0, 0, s * (RINK.width / 2 + off + tierDepth / 2));
      parts.push(b);
    }
    // Ends.
    for (const s of [-1, 1]) {
      const b = CreateBox('stand', { width: tierDepth, height: y * 2, depth: RINK.width + 2 * off }, scene);
      b.position.set(s * (RINK.length / 2 + off + tierDepth / 2), 0, 0);
      parts.push(b);
    }
  }
  const mesh = Mesh.MergeMeshes(parts, true, true) as Mesh;
  mesh.name = 'surroundings';
  const mat = new StandardMaterial('surroundMat', scene);
  mat.diffuseColor = new Color3(0.16, 0.19, 0.25);
  mat.specularColor = Color3.Black();
  mesh.material = mat;
  return mesh;
}
