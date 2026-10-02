import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { APP_COMMIT, APP_VERSION } from '../config/version';
import { getLanguage, LANGUAGES, onLanguageChange, setLanguage, t, translateDom, type Language, type MessageKey } from '../i18n';
import { el } from './dom';
import { saveSettings, type Settings } from './settings';

export interface MenuCallbacks {
  /** "Play"/"Resume" pressed (inside a user gesture: safe to request fullscreen). */
  onPlay: () => void;
  /** Quality changed: the engine must be recreated, so the app reloads. */
  onQualityChange: (q: QualityLevel) => void;
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
      el('div', { className: 'setting' }, [
        el('span', { className: 'setting-label', i18n: 'settings.quality' }),
        this.qualityChoices(),
      ]),
      el('p', { className: 'hint', i18n: 'settings.qualityNote' }),
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

  private refreshTexts(): void {
    translateDom(this.element);
    this.playButton.textContent = t((this.started ? 'menu.resume' : 'menu.play') satisfies MessageKey);
    this.versionLabel.textContent = t('settings.version', { version: `${APP_VERSION} (${APP_COMMIT})` });
    this.element.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.lang === getLanguage());
      b.setAttribute('aria-checked', String(b.dataset.lang === getLanguage()));
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
