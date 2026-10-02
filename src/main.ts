import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { setLanguage, translateDom, onLanguageChange, t } from './i18n';
import { isQualityLevel } from './config/quality';
import { TUNING, TUNING_DEFAULTS } from './config/tuning';
import { TUNING_PARAMS } from './config/tuningMeta';
import { Game } from './game/game';
import { TuningOverrides, type KeyValueStorage } from './game/tuningOverrides';
import { Renderer } from './render/renderer';
import { HumanInput } from './input/humanInput';
import { createPauseButton } from './ui/overlays';
import { enterFullscreenLandscape } from './ui/fullscreen';
import { createDebugPanel, isDebugEnabled } from './ui/debugPanel';
import { loadSettings } from './ui/settings';
import { Menu } from './ui/menu';
import { createStaleNotice, TuningPanel } from './ui/tuningPanel';
import { el } from './ui/dom';
import { CAMERA_PRESET_IDS, type CameraPresetId } from './render/cameraPresets';
import { saveSettings } from './ui/settings';
import { createWorld, stepWorld } from './sim/world';

registerSW({ immediate: true });

const settings = loadSettings();
setLanguage(settings.language);
document.documentElement.lang = settings.language;

// Saved tuning overrides must be applied before anything reads TUNING (camera, sim).
function safeLocalStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const tuning = new TuningOverrides(TUNING, TUNING_DEFAULTS, safeLocalStorage(), 'patins.tuning.v1', new Set(TUNING_PARAMS.map((p) => p.path)));
tuning.load();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;
const debug = isDebugEnabled();

// ?quality= overrides the saved setting (handy for testing on the device).
const qualityParam = new URLSearchParams(location.search).get('quality');
const renderer = new Renderer(canvas, isQualityLevel(qualityParam) ? qualityParam : settings.quality, settings.camera);
const input = new HumanInput();
const game = new Game(renderer, input);
game.paused = true;

const tuningPanel = new TuningPanel(tuning);

function resume(): void {
  game.paused = false;
  input.enabled = true;
  hud.hidden = false;
}

function pause(): void {
  if (game.paused) return;
  game.paused = true;
  input.enabled = false;
  hud.hidden = true;
  tuningPanel.close();
  menu.showMain();
}

const menu = new Menu(settings, {
  onPlay: () => {
    resume();
    void enterFullscreenLandscape();
  },
  onQualityChange: (q) => renderer.setQuality(q),
  onTuningModeChange: () => updateTuningUi(),
  onCameraChange: (id) => setCamera(id),
});

// Camera: in-game button cycles TV → close → tactical; the choice is remembered.
const cameraButton = el('button', { className: 'hud-btn btn-camera', attrs: { id: 'btn-camera', 'data-i18n-aria': 'hud.camera' } });
function setCamera(id: CameraPresetId): void {
  renderer.cameraRig.setPreset(id);
  if (settings.camera !== id) {
    settings.camera = id;
    saveSettings(settings);
    menu.refresh();
  }
  cameraButton.textContent = `🎥 ${t(`camera.${id}`)}`;
  cameraButton.dataset.camera = id;
}
cameraButton.addEventListener('click', () => {
  const i = CAMERA_PRESET_IDS.indexOf(settings.camera);
  setCamera(CAMERA_PRESET_IDS[(i + 1) % CAMERA_PRESET_IDS.length]!);
});
onLanguageChange(() => setCamera(settings.camera));
setCamera(settings.camera);

// In-game layer: joystick surface, sprint button, pause and tuning buttons.
const tuningButton = el('button', { className: 'hud-btn btn-tuning', attrs: { id: 'btn-tuning', 'data-i18n-aria': 'hud.tuning' } }, ['⚙']);
tuningButton.addEventListener('click', () => tuningPanel.toggle());
const tuningChip = el('div', { className: 'tuning-chip', attrs: { id: 'tuning-chip' } });

function updateTuningUi(): void {
  tuningButton.hidden = !(settings.tuningMode || debug);
  const n = tuning.modifiedPaths().length;
  tuningChip.hidden = n === 0;
  tuningChip.textContent = t('tuning.modified', { n });
  if (tuningButton.hidden) tuningPanel.close();
}
tuning.onChange(updateTuningUi);
onLanguageChange(updateTuningUi);

const hud = el('div', { className: 'hud', attrs: { id: 'hud' } }, [
  input.joystick.element,
  input.sprintButton.element,
  el('div', { className: 'hud-top' }, [createPauseButton(pause), tuningButton, cameraButton, tuningChip]),
]);
hud.hidden = true;

uiRoot.append(hud, tuningPanel.element, menu.element);
const staleNotice = createStaleNotice(tuning.stale);
if (staleNotice) uiRoot.append(staleNotice);
if (debug) uiRoot.append(createDebugPanel(game, renderer));
updateTuningUi();
translateDom(uiRoot);
onLanguageChange(() => translateDom(uiRoot));

// Leaving fullscreen (swipe + back) or switching apps mid-match pauses the game, so the
// orientation lock being released never changes the screen under the player's thumbs.
let wasFullscreen = false;
document.addEventListener('fullscreenchange', () => {
  const now = Boolean(document.fullscreenElement);
  if (wasFullscreen && !now) pause();
  wasFullscreen = now;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause();
});

game.start();

// Read-only hook for automated tests (Playwright perf/smoke checks).
(window as unknown as { __PATINS__: unknown }).__PATINS__ = {
  game,
  tuning,
  renderer,
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
