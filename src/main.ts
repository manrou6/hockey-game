import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { setLanguage, translateDom, onLanguageChange } from './i18n';
import { isQualityLevel } from './config/quality';
import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { HumanInput } from './input/humanInput';
import { createPauseButton, createRotateHint } from './ui/overlays';
import { enterFullscreenLandscape } from './ui/fullscreen';
import { createDebugPanel, isDebugEnabled } from './ui/debugPanel';
import { loadSettings } from './ui/settings';
import { Menu } from './ui/menu';
import { TUNING } from './config/tuning';
import { createWorld, stepWorld } from './sim/world';

registerSW({ immediate: true });

const settings = loadSettings();
setLanguage(settings.language);
document.documentElement.lang = settings.language;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

// ?quality= overrides the saved setting (handy for testing on the device).
const qualityParam = new URLSearchParams(location.search).get('quality');
const renderer = new Renderer(canvas, isQualityLevel(qualityParam) ? qualityParam : settings.quality);
const input = new HumanInput();
const game = new Game(renderer, input);
game.paused = true;

const menu = new Menu(settings, {
  onPlay: () => {
    game.paused = false;
    input.enabled = true;
    hud.hidden = false;
    void enterFullscreenLandscape();
  },
  onQualityChange: () => location.reload(),
});

const pauseButton = createPauseButton(() => {
  game.paused = true;
  input.enabled = false;
  hud.hidden = true;
  menu.showMain();
});

// In-game layer: joystick surface, sprint button and pause button.
const hud = document.createElement('div');
hud.className = 'hud';
hud.id = 'hud';
hud.hidden = true;
hud.append(input.joystick.element, input.sprintButton.element, pauseButton);

uiRoot.append(hud, menu.element, createRotateHint());
if (isDebugEnabled()) uiRoot.append(createDebugPanel(game, renderer));
translateDom(uiRoot);
onLanguageChange(() => translateDom(uiRoot));

game.start();

// Read-only hook for automated tests (Playwright perf/smoke checks).
(window as unknown as { __PATINS__: unknown }).__PATINS__ = {
  game,
  perf: () => ({
    ...renderer.renderStats(),
    frameAvg: game.frameStats.average(),
    frameP95: game.frameStats.percentile(95),
    cpuAvg: game.workStats.average(),
    cpuP95: game.workStats.percentile(95),
  }),
  /** Mean cost (ms) of one sim tick on a throwaway world (does not touch the live game). */
  benchSim: (ticks: number): number => {
    const w = createWorld(7);
    const cmds = [{ moveX: 1, moveY: 0.3, sprint: true }];
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) {
      if (i % 90 === 0) cmds[0]!.moveY = -cmds[0]!.moveY;
      stepWorld(w, cmds, TUNING);
    }
    return (performance.now() - t0) / ticks;
  },
};
