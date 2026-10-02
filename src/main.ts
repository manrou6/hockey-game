import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { translateDom } from './i18n';
import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { createRotateHint, createStartOverlay } from './ui/overlays';
import { enterFullscreenLandscape } from './ui/fullscreen';
import { createDebugPanel, isDebugEnabled } from './ui/debugPanel';

registerSW({ immediate: true });

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

const renderer = new Renderer(canvas);
const game = new Game(renderer, null);

uiRoot.append(
  createStartOverlay(() => void enterFullscreenLandscape()),
  createRotateHint(),
);
if (isDebugEnabled()) uiRoot.append(createDebugPanel(game, renderer));
translateDom(uiRoot);

game.start();

// Read-only hook for automated tests (Playwright perf/smoke checks).
(window as unknown as { __PATINS__: unknown }).__PATINS__ = { game };
