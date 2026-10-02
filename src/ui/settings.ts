import { DEFAULT_QUALITY, isQualityLevel, type QualityLevel } from '../config/quality';
import { isLanguage, type Language } from '../i18n';
import { isCameraPresetId, type CameraPresetId } from '../render/cameraPresets';
import { isAssistLevel, type AssistLevel } from '../sim/pass';

/** Player-facing settings persisted on the device. */
export interface Settings {
  language: Language;
  quality: QualityLevel;
  /** Shows the in-game ⚙ tuning button. */
  tuningMode: boolean;
  /** Last camera chosen (kept between matches). */
  camera: CameraPresetId;
  /** Pass assist level (docs/03 §3): off / light (default) / strong. */
  assist: AssistLevel;
}

const STORAGE_KEY = 'patins.settings.v1';
const DEFAULTS: Settings = { language: 'ca', quality: DEFAULT_QUALITY, tuningMode: false, camera: 'tv', assist: 'light' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      language: isLanguage(data.language) ? data.language : DEFAULTS.language,
      quality: isQualityLevel(data.quality) ? data.quality : DEFAULTS.quality,
      tuningMode: typeof data.tuningMode === 'boolean' ? data.tuningMode : DEFAULTS.tuningMode,
      camera: isCameraPresetId(data.camera) ? data.camera : DEFAULTS.camera,
      assist: isAssistLevel(data.assist) ? data.assist : DEFAULTS.assist,
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
