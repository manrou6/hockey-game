import { APP_COMMIT, APP_VERSION } from '../config/version';
import type { Game } from '../game/game';
import type { Renderer } from '../render/renderer';
import { el } from './dom';

// Developer-only stats overlay (?debug=1). Labels are code identifiers, intentionally not
// translated. Tuning moved to the touch tuning panel (Settings → tuning mode).

export function isDebugEnabled(): boolean {
  return new URLSearchParams(location.search).get('debug') === '1';
}

export function createDebugPanel(game: Game, renderer: Renderer): HTMLElement {
  const stats = el('pre', { className: 'debug-stats' });
  const panel = el('div', { className: 'debug-panel', attrs: { id: 'debug-panel' } }, [stats]);
  let frames = 0;
  game.onFrame(() => {
    // Refresh text ~4 times per second to keep DOM work negligible.
    if (++frames % 15 !== 0) return;
    const fs = game.frameStats;
    const ws = game.workStats;
    const rs = renderer.renderStats();
    const pctNative = Math.round((rs.pixelRatio / rs.nativePixelRatio) * 100);
    stats.textContent =
      `${APP_VERSION} (${APP_COMMIT})\n` +
      `fps ${fs.fps().toFixed(1)}  frame avg ${fs.average().toFixed(2)} p95 ${fs.percentile(95).toFixed(2)} max ${fs.max().toFixed(1)} ms\n` +
      `cpu avg ${ws.average().toFixed(2)} p95 ${ws.percentile(95).toFixed(2)} ms  gpu ${rs.gpuMs === null ? 'n/a' : `${rs.gpuMs.toFixed(2)} ms`}\n` +
      `tick ${game.world.tick}  steps/frame ${game.loop.lastSteps}  alpha ${game.loop.alpha.toFixed(2)}\n` +
      `draws ${rs.drawCalls}  meshes ${rs.activeMeshes}  tris ${rs.triangles}\n` +
      `res ${rs.width}x${rs.height} (${pctNative}% native, dpr ${rs.pixelRatio.toFixed(2)}/${rs.nativePixelRatio.toFixed(2)})`;
  });
  return panel;
}
