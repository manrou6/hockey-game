import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { APP_COMMIT, APP_VERSION } from '../config/version';
import { getLanguage, LANGUAGES, onLanguageChange, setLanguage, t, translateDom, type Language, type MessageKey } from '../i18n';
import { el } from './dom';
import { saveSettings, type Settings } from './settings';
import { CAMERA_PRESET_IDS, type CameraPresetId } from '../render/cameraPresets';
import { ASSIST_LEVELS, type AssistLevel } from '../sim/pass';

export interface MenuCallbacks {
  /** "Play"/"Resume" pressed (inside a user gesture: safe to request fullscreen). */
  onPlay: () => void;
  /** Quality changed: applied immediately by the renderer. */
  onQualityChange: (q: QualityLevel) => void;
  /** Tuning mode toggled (shows/hides the in-game ⚙ button). */
  onTuningModeChange: (on: boolean) => void;
  /** Camera preset chosen in settings. */
  onCameraChange: (id: CameraPresetId) => void;
  /** Pass assist level chosen in settings. */
  onAssistChange: (level: AssistLevel) => void;
  /** Pass arrow on/off. */
  onPassArrowChange: (on: boolean) => void;
  /** Shot reticle on/off (F1.5a). */
  onShotReticleChange: (on: boolean) => void;
}

/** Main menu + settings screen, as two full-screen overlays. */
export class Menu {
  readonly element: HTMLElement;
  private readonly main: HTMLElement;
  private readonly settingsPanel: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly versionLabel: HTMLElement;
  private started = false;

  constructor(
    private readonly settings: Settings,
    private readonly callbacks: MenuCallbacks,
  ) {
    this.playButton = el('button', { className: 'btn-primary', i18n: 'menu.play', attrs: { id: 'btn-play' } });
    this.playButton.addEventListener('click', () => {
      this.started = true;
      this.hide();
      this.callbacks.onPlay();
    });
    const settingsButton = el('button', { className: 'btn-secondary', i18n: 'menu.settings', attrs: { id: 'btn-settings' } });
    settingsButton.addEventListener('click', () => this.showSettings());

    this.main = el('div', { className: 'overlay menu', attrs: { id: 'main-menu' } }, [
      el('h1', { className: 'title', i18n: 'app.title' }),
      this.playButton,
      settingsButton,
      el('p', { className: 'hint', i18n: 'menu.controlsHint' }),
    ]);

    this.versionLabel = el('p', { className: 'version', attrs: { id: 'version-label' } });
    const back = el('button', { className: 'btn-secondary', i18n: 'menu.back', attrs: { id: 'btn-back' } });
    back.addEventListener('click', () => this.showMain());

    this.settingsPanel = el('div', { className: 'overlay menu', attrs: { id: 'settings-screen' } }, [
      el('h2', { className: 'subtitle', i18n: 'settings.title' }),
      el('div', { className: 'setting' }, [el('span', { className: 'setting-label', i18n: 'settings.language' }), this.languageChoices()]),
      el('div', { className: 'setting' }, [el('span', { className: 'setting-label', i18n: 'settings.camera' }), this.cameraChoices()]),
      el('div', { className: 'setting' }, [el('span', { className: 'setting-label', i18n: 'settings.assist' }), this.assistChoices()]),
      el('div', { className: 'setting' }, [el('span', { className: 'setting-label', i18n: 'settings.passArrow' }), this.passArrowChoices()]),
      el('div', { className: 'setting' }, [el('span', { className: 'setting-label', i18n: 'settings.shotReticle' }), this.shotReticleChoices()]),
      el('div', { className: 'setting' }, [
        el('span', { className: 'setting-label', i18n: 'settings.quality' }),
        this.qualityChoices(),
      ]),
      el('div', { className: 'setting' }, [
        el('span', { className: 'setting-label', i18n: 'settings.tuningMode' }),
        this.tuningChoices(),
      ]),
      el('p', { className: 'hint', i18n: 'settings.tuningModeHint' }),
      this.versionLabel,
      back,
    ]);
    this.settingsPanel.hidden = true;

    this.element = el('div', { className: 'menu-root' }, [this.main, this.settingsPanel]);
    this.refreshTexts();
    onLanguageChange(() => this.refreshTexts());
  }

  private languageChoices(): HTMLElement {
    const group = el('div', { className: 'choices', attrs: { role: 'radiogroup' } });
    for (const lang of LANGUAGES) {
      const b = el('button', { className: 'choice', i18n: `lang.${lang}`, attrs: { 'data-lang': lang, id: `lang-${lang}` } });
      b.addEventListener('click', () => this.selectLanguage(lang));
      group.append(b);
    }
    return group;
  }

  private qualityChoices(): HTMLElement {
    const group = el('div', { className: 'choices', attrs: { role: 'radiogroup' } });
    for (const q of Object.keys(QUALITY_PRESETS) as QualityLevel[]) {
      const b = el('button', { className: 'choice', i18n: `quality.${q}`, attrs: { 'data-quality': q, id: `quality-${q}` } });
      b.addEventListener('click', () => {
        if (q === this.settings.quality) return;
        this.settings.quality = q;
        saveSettings(this.settings);
        this.callbacks.onQualityChange(q);
        this.refreshTexts();
      });
      group.append(b);
    }
    return group;
  }

  private cameraChoices(): HTMLElement {
    const group = el('div', { className: 'choices', attrs: { role: 'radiogroup' } });
    for (const id of CAMERA_PRESET_IDS) {
      const b = el('button', { className: 'choice', i18n: `camera.${id}`, attrs: { 'data-camera': id, id: `camera-${id}` } });
      b.addEventListener('click', () => {
        this.settings.camera = id;
        saveSettings(this.settings);
        this.callbacks.onCameraChange(id);
        this.refreshTexts();
      });
      group.append(b);
    }
    return group;
  }

  private assistChoices(): HTMLElement {
    const group = el('div', { className: 'choices', attrs: { role: 'radiogroup' } });
    for (const level of ASSIST_LEVELS) {
      const b = el('button', { className: 'choice', i18n: `assist.${level}`, attrs: { 'data-assist': level, id: `assist-${level}` } });
      b.addEventListener('click', () => {
        this.settings.assist = level;
        saveSettings(this.settings);
        this.callbacks.onAssistChange(level);
        this.refreshTexts();
      });
      group.append(b);
    }
    return group;
  }

  private passArrowChoices(): HTMLElement {
    const group = el('div', { className: 'choices', attrs: { role: 'radiogroup' } });
    for (const on of [true, false]) {
      const b = el('button', { className: 'choice', i18n: on ? 'common.yes' : 'common.no', attrs: { 'data-arrow': String(on), id: `arrow-${on ? 'on' : 'off'}` } });
      b.addEventListener('click', () => {
        this.settings.passArrow = on;
        saveSettings(this.settings);
        this.callbacks.onPassArrowChange(on);
        this.refreshTexts();
      });
      group.append(b);
    }
    return group;
  }

  private shotReticleChoices(): HTMLElement {
    const group = el('div', { className: 'choices', attrs: { role: 'radiogroup' } });
    for (const on of [true, false]) {
      const b = el('button', { className: 'choice', i18n: on ? 'common.yes' : 'common.no', attrs: { 'data-reticle': String(on), id: `reticle-${on ? 'on' : 'off'}` } });
      b.addEventListener('click', () => {
        this.settings.shotReticle = on;
        saveSettings(this.settings);
        this.callbacks.onShotReticleChange(on);
        this.refreshTexts();
      });
      group.append(b);
    }
    return group;
  }

  private tuningChoices(): HTMLElement {
    const group = el('div', { className: 'choices', attrs: { role: 'radiogroup' } });
    for (const on of [true, false]) {
      const b = el('button', { className: 'choice', i18n: on ? 'common.yes' : 'common.no', attrs: { 'data-tuning': String(on), id: `tuning-${on ? 'on' : 'off'}` } });
      b.addEventListener('click', () => {
        this.settings.tuningMode = on;
        saveSettings(this.settings);
        this.callbacks.onTuningModeChange(on);
        this.refreshTexts();
      });
      group.append(b);
    }
    return group;
  }

  private selectLanguage(lang: Language): void {
    this.settings.language = lang;
    saveSettings(this.settings);
    setLanguage(lang);
  }

  /** Re-read settings into the buttons (e.g. after the in-game camera button changed them). */
  refresh(): void {
    this.refreshTexts();
  }

  private refreshTexts(): void {
    translateDom(this.element);
    this.playButton.textContent = t((this.started ? 'menu.resume' : 'menu.play') satisfies MessageKey);
    this.versionLabel.textContent = t('settings.version', { version: `${APP_VERSION} (${APP_COMMIT})` });
    this.element.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.lang === getLanguage());
      b.setAttribute('aria-checked', String(b.dataset.lang === getLanguage()));
    });
    this.element.querySelectorAll<HTMLElement>('[data-camera]').forEach((b) => {
      const sel = b.dataset.camera === this.settings.camera;
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-checked', String(sel));
    });
    this.element.querySelectorAll<HTMLElement>('[data-assist]').forEach((b) => {
      const sel = b.dataset.assist === this.settings.assist;
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-checked', String(sel));
    });
    this.element.querySelectorAll<HTMLElement>('[data-arrow]').forEach((b) => {
      const sel = b.dataset.arrow === String(this.settings.passArrow);
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-checked', String(sel));
    });
    this.element.querySelectorAll<HTMLElement>('[data-reticle]').forEach((b) => {
      const sel = b.dataset.reticle === String(this.settings.shotReticle);
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-checked', String(sel));
    });
    this.element.querySelectorAll<HTMLElement>('[data-tuning]').forEach((b) => {
      const sel = b.dataset.tuning === String(this.settings.tuningMode);
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-checked', String(sel));
    });
    this.element.querySelectorAll<HTMLElement>('[data-quality]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.quality === this.settings.quality);
      b.setAttribute('aria-checked', String(b.dataset.quality === this.settings.quality));
    });
  }

  get visible(): boolean {
    return !this.main.hidden || !this.settingsPanel.hidden;
  }

  showMain(): void {
    this.settingsPanel.hidden = true;
    this.main.hidden = false;
    this.refreshTexts();
  }

  showSettings(): void {
    this.main.hidden = true;
    this.settingsPanel.hidden = false;
    this.refreshTexts();
  }

  hide(): void {
    this.main.hidden = true;
    this.settingsPanel.hidden = true;
  }
}
