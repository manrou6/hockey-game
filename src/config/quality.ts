// Render quality presets (docs/04: Bajo / Medio / Alto). Auto-detection comes later (F6);
// for now the default is "medium" and can be overridden with ?quality=low|medium|high.
// Every field can change at runtime (no engine re-creation, so fullscreen is kept).

export interface QualityPreset {
  /** Cap on device pixel ratio used for the render buffer (Pixel 8a native = 2.625). */
  maxPixelRatio: number;
  /** Shadow map resolution for the single shadow-casting light (0 = no shadows). */
  shadowMapSize: number;
}

export const QUALITY_PRESETS = {
  low: { maxPixelRatio: 1.25, shadowMapSize: 0 },
  medium: { maxPixelRatio: 1.75, shadowMapSize: 1024 },
  high: { maxPixelRatio: 2.625, shadowMapSize: 2048 },
} as const satisfies Record<string, QualityPreset>;

export type QualityLevel = keyof typeof QUALITY_PRESETS;
export const DEFAULT_QUALITY: QualityLevel = 'medium';

export function isQualityLevel(v: unknown): v is QualityLevel {
  return typeof v === 'string' && v in QUALITY_PRESETS;
}
