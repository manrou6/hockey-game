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
  /** Pass assist level (docs/03 §3): off / light / medium (default) / strong. */
  assist: AssistLevel;
  /** Arrow on the floor showing the pass while PASE is held (default on). */
  passArrow: boolean;
  /** Reticle on the goal showing where the shot would go (F1.5a, default on). */
  shotReticle: boolean;
  /** Short vibrations on the phone (v0.1.29: a perfect remate en el aire; default on). */
  vibration: boolean;
}

const STORAGE_KEY = 'patins.settings.v1';
const DEFAULTS: Settings = { language: 'ca', quality: DEFAULT_QUALITY, tuningMode: false, camera: 'tv', assist: 'medium', passArrow: true, shotReticle: true, vibration: true };

/**
 * Revision of the assist default. v0.1.21 made Mitjana the default: a device that saved its
 * settings before (with the old default, Lleugera) is moved to it once; from then on a choice
 * made in Settings is kept as it is.
 */
const ASSIST_REV = 2;

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<Record<keyof Settings | 'assistRev', unknown>>;
    return {
      language: isLanguage(data.language) ? data.language : DEFAULTS.language,
      quality: isQualityLevel(data.quality) ? data.quality : DEFAULTS.quality,
      tuningMode: typeof data.tuningMode === 'boolean' ? data.tuningMode : DEFAULTS.tuningMode,
      camera: isCameraPresetId(data.camera) ? data.camera : DEFAULTS.camera,
      assist: Number(data.assistRev) >= ASSIST_REV && isAssistLevel(data.assist) ? data.assist : DEFAULTS.assist,
      passArrow: typeof data.passArrow === 'boolean' ? data.passArrow : DEFAULTS.passArrow,
      shotReticle: typeof data.shotReticle === 'boolean' ? data.shotReticle : DEFAULTS.shotReticle,
      vibration: typeof data.vibration === 'boolean' ? data.vibration : DEFAULTS.vibration,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, assistRev: ASSIST_REV }));
  } catch {
    /* storage unavailable (private mode): settings just won't persist */
  }
}
