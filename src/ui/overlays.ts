import { el } from './dom';
import { enterFullscreenLandscape } from './fullscreen';

/**
 * "Turn your phone" screen, visible only in portrait via CSS. Includes a button that
 * enters fullscreen and locks landscape, which also works when the phone has auto-rotate
 * disabled (otherwise the browser would stay in portrait forever).
 */
export function createRotateHint(): HTMLElement {
  const button = el('button', { className: 'btn-primary', i18n: 'rotate.button', attrs: { id: 'btn-rotate' } });
  button.addEventListener('click', () => void enterFullscreenLandscape());
  return el('div', { className: 'overlay rotate-hint', attrs: { id: 'rotate-hint' } }, [
    el('div', { className: 'rotate-icon', attrs: { 'aria-hidden': 'true' } }, ['📱']),
    el('p', { className: 'rotate-text', i18n: 'rotate.hint' }),
    button,
    el('p', { className: 'hint', i18n: 'rotate.autoRotateTip' }),
  ]);
}

/** Small in-game pause button (top right) that brings the menu back. */
export function createPauseButton(onPause: () => void): HTMLButtonElement {
  const b = el('button', { className: 'hud-btn btn-pause', attrs: { id: 'btn-pause', 'data-i18n-aria': 'hud.pause' } }, ['❚❚']);
  b.addEventListener('click', onPause);
  return b;
}
