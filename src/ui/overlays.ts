import { el } from './dom';

/** "Turn your phone" hint, visible only in portrait via CSS. */
export function createRotateHint(): HTMLElement {
  return el('div', { className: 'overlay rotate-hint' }, [
    el('div', { className: 'rotate-icon', attrs: { 'aria-hidden': 'true' } }, ['📱']),
    el('p', { i18n: 'rotate.hint' }),
  ]);
}

/** Small in-game pause button (top right) that brings the menu back. */
export function createPauseButton(onPause: () => void): HTMLButtonElement {
  const b = el('button', { className: 'hud-btn btn-pause', attrs: { id: 'btn-pause', 'data-i18n-aria': 'hud.pause' } }, ['❚❚']);
  b.addEventListener('click', onPause);
  return b;
}
