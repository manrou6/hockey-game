import { TUNING } from '../config/tuning';
import { APP_COMMIT, APP_VERSION } from '../config/version';
import type { Game } from '../game/game';
import type { Renderer } from '../render/renderer';
import { el } from './dom';

// Developer-only tool (?debug=1). Labels are code identifiers, intentionally not translated.

export function isDebugEnabled(): boolean {
  return new URLSearchParams(location.search).get('debug') === '1';
}

export function createDebugPanel(game: Game, renderer: Renderer): HTMLElement {
  const stats = el('pre', { className: 'debug-stats' });
  const tuningBox = el('div', { className: 'debug-tuning' });
  tuningBox.hidden = true;
  const toggle = el('button', { className: 'debug-btn' }, ['tuning ▾']);
  toggle.addEventListener('click', () => {
    tuningBox.hidden = !tuningBox.hidden;
  });
  buildTuningEditor(tuningBox, TUNING as unknown as Record<string, Record<string, unknown>>);

  const panel = el('div', { className: 'debug-panel', attrs: { id: 'debug-panel' } }, [stats, toggle, tuningBox]);

  let frames = 0;
  game.onFrame(() => {
    // Refresh text ~4 times per second to keep DOM work negligible.
    if (++frames % 15 !== 0) return;
    const fs = game.frameStats;
    const ws = game.workStats;
    const eng = renderer.engine;
    const rs = renderer.renderStats();
    stats.textContent =
      `${APP_VERSION} (${APP_COMMIT})\n` +
      `fps ${fs.fps().toFixed(1)}  frame avg ${fs.average().toFixed(2)} p95 ${fs.percentile(95).toFixed(2)} max ${fs.max().toFixed(1)} ms\n` +
      `cpu avg ${ws.average().toFixed(2)} p95 ${ws.percentile(95).toFixed(2)} ms\n` +
      `tick ${game.world.tick}  steps/frame ${game.loop.lastSteps}  alpha ${game.loop.alpha.toFixed(2)}\n` +
      `draws ${rs.drawCalls}  meshes ${rs.activeMeshes}  tris ${rs.triangles}\n` +
      `res ${eng.getRenderWidth()}x${eng.getRenderHeight()}  scale ${eng.getHardwareScalingLevel().toFixed(2)}`;
  });
  return panel;
}

function buildTuningEditor(root: HTMLElement, tuning: Record<string, Record<string, unknown>>): void {
  for (const [section, values] of Object.entries(tuning)) {
    root.append(el('div', { className: 'debug-section' }, [section]));
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== 'number') continue;
      const initial = value;
      const max = initial === 0 ? 1 : Math.abs(initial) * 3;
      const min = initial < 0 ? -max : 0;
      const input = el('input', {
        attrs: { type: 'range', min: String(min), max: String(max), step: String(max / 300), value: String(initial) },
      });
      const out = el('span', { className: 'debug-val' }, [fmt(initial)]);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        values[key] = v;
        out.textContent = fmt(v);
      });
      root.append(el('label', { className: 'debug-row' }, [el('span', {}, [key]), input, out]));
    }
  }
}

function fmt(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3);
}
