import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import { RINK } from '../config/rink';

// Floor colours (render-only look, not game feel).
const COLORS = {
  outside: '#1b2533',
  court: '#2c6cb0',
  courtEdge: '#275f9c',
  line: '#f4f7fb',
  goalLine: '#d8343c',
};

/**
 * Paints the rink floor with all regulation markings onto a canvas texture that maps
 * to a ground plane of exactly length × width metres. Generated at runtime: no asset.
 */
export function createRinkFloorTexture(scene: Scene, pxPerMeter = 51.2): DynamicTexture {
  const W = Math.round(RINK.length * pxPerMeter);
  const H = Math.round(RINK.width * pxPerMeter);
  const tex = new DynamicTexture('rinkFloorTex', { width: W, height: H }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const s = pxPerMeter;
  // Canvas origin top-left; rink centre at (W/2, H/2). All markings are symmetric.
  const X = (m: number): number => W / 2 + m * s;
  const Y = (m: number): number => H / 2 + m * s;

  ctx.fillStyle = COLORS.outside;
  ctx.fillRect(0, 0, W, H);

  // Court with rounded corners and a subtle vignette so the surface doesn't look flat.
  const r = RINK.cornerRadius * s;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, r);
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.6);
  grad.addColorStop(0, COLORS.court);
  grad.addColorStop(1, COLORS.courtEdge);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.lineWidth = RINK.lineWidth * s;
  ctx.strokeStyle = COLORS.line;
  ctx.fillStyle = COLORS.line;

  // Centre line, centre circle and centre spot.
  ctx.beginPath();
  ctx.moveTo(X(0), 0);
  ctx.lineTo(X(0), H);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(0), Y(0), RINK.centreCircleRadius * s, 0, Math.PI * 2);
  ctx.stroke();
  spot(ctx, X(0), Y(0), 0.12 * s);

  for (const side of [-1, 1] as const) {
    const gx = side * (RINK.length / 2 - RINK.goalLineFromEnd);
    const inward = -side;

    // Penalty area: 9 m wide, 5.4 m deep from the goal line.
    const ax0 = X(gx);
    const ax1 = X(gx + inward * RINK.penaltyAreaDepth);
    ctx.strokeRect(Math.min(ax0, ax1), Y(-RINK.penaltyAreaWidth / 2), Math.abs(ax1 - ax0), RINK.penaltyAreaWidth * s);

    // Goalkeeper protection half-circle.
    ctx.beginPath();
    ctx.arc(X(gx), Y(0), RINK.goalkeeperAreaRadius * s, side > 0 ? Math.PI / 2 : -Math.PI / 2, side > 0 ? (Math.PI * 3) / 2 : Math.PI / 2);
    ctx.stroke();

    // Goal line (between posts), drawn red so it reads from the TV camera.
    ctx.save();
    ctx.strokeStyle = COLORS.goalLine;
    ctx.beginPath();
    ctx.moveTo(X(gx), Y(-RINK.goalWidth / 2));
    ctx.lineTo(X(gx), Y(RINK.goalWidth / 2));
    ctx.stroke();
    ctx.restore();

    // Penalty and direct free hit spots.
    spot(ctx, X(gx + inward * RINK.penaltySpotDistance), Y(0), 0.1 * s);
    spot(ctx, X(gx + inward * RINK.directFreeHitDistance), Y(0), 0.1 * s);
  }

  tex.update(true);
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

function spot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
