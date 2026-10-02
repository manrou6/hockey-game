import { DEFAULT_QUALITY, isQualityLevel, type QualityLevel } from '../config/quality';
import { isLanguage, type Language } from '../i18n';

/** Player-facing settings persisted on the device. */
export interface Settings {
  language: Language;
  quality: QualityLevel;
}

const STORAGE_KEY = 'patins.settings.v1';
const DEFAULTS: Settings = { language: 'ca', quality: DEFAULT_QUALITY };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      language: isLanguage(data.language) ? data.language : DEFAULTS.language,
      quality: isQualityLevel(data.quality) ? data.quality : DEFAULTS.quality,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode): settings just won't persist */
  }
}
