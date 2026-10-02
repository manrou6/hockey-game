import { el } from './dom';

/** "Turn your phone" hint, visible only in portrait via CSS. */
export function createRotateHint(): HTMLElement {
  return el('div', { className: 'overlay rotate-hint' }, [
    el('div', { className: 'rotate-icon', attrs: { 'aria-hidden': 'true' } }, ['📱']),
    el('p', { i18n: 'rotate.hint' }),
  ]);
}

/** Title screen with a single big "tap to play" button. */
export function createStartOverlay(onStart: () => void): HTMLElement {
  const button = el('button', { className: 'btn-primary', i18n: 'start.tap', attrs: { id: 'btn-start' } });
  const overlay = el('div', { className: 'overlay', attrs: { id: 'start-overlay' } }, [
    el('h1', { className: 'title', i18n: 'app.title' }),
    button,
  ]);
  button.addEventListener('click', () => {
    overlay.hidden = true;
    onStart();
  });
  return overlay;
}
