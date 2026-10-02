import { describe, expect, it } from 'vitest';
import { TUNING_DEFAULTS } from '../../src/config/tuning';
import { TUNING_PARAMS } from '../../src/config/tuningMeta';
import ca from '../../src/i18n/ca.json';

const leaves = Object.entries(TUNING_DEFAULTS as unknown as Record<string, Record<string, unknown>>)
  .filter(([section]) => section !== 'sim')
  .flatMap(([section, values]) =>
    Object.entries(values)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => `${section}.${k}`),
  );

describe('tuning panel metadata', () => {
  it('every tunable number (except sim) is exposed in the panel exactly once', () => {
    const paths = TUNING_PARAMS.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect([...paths].sort()).toEqual([...leaves].sort());
  });

  it.each(TUNING_PARAMS.map((p) => [p.path, p]))('%s: factory value is inside its range', (_path, p) => {
    const [section, key] = p.path.split('.') as [string, string];
    const v = (TUNING_DEFAULTS as unknown as Record<string, Record<string, number>>)[section]![key]! * (p.scale ?? 1);
    expect(v).toBeGreaterThanOrEqual(p.min);
    expect(v).toBeLessThanOrEqual(p.max);
    expect(p.step).toBeGreaterThan(0);
  });

  it('every parameter and section has a label', () => {
    const dict = ca as Record<string, string>;
    for (const p of TUNING_PARAMS) expect(dict[`tuning.${p.path}`], p.path).toBeTruthy();
    for (const s of ['skating', 'input', 'camera']) expect(dict[`tuning.section.${s}`], s).toBeTruthy();
  });
});
