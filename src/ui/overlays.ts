import { el } from './dom';

/** Small in-game pause button (top right) that brings the menu back. */
export function createPauseButton(onPause: () => void): HTMLButtonElement {
  const b = el('button', { className: 'hud-btn btn-pause', attrs: { id: 'btn-pause', 'data-i18n-aria': 'hud.pause' } }, ['❚❚']);
  b.addEventListener('click', onPause);
  return b;
}
