import { describe, expect, it } from 'vitest';
import ca from '../../src/i18n/ca.json';
import es from '../../src/i18n/es.json';
import en from '../../src/i18n/en.json';

describe('i18n dictionaries', () => {
  const caKeys = Object.keys(ca).sort();
  it.each([
    ['es', es],
    ['en', en],
  ])('%s has exactly the same keys as ca', (_name, dict) => {
    expect(Object.keys(dict).sort()).toEqual(caKeys);
  });
  it('has no empty strings', () => {
    for (const dict of [ca, es, en]) for (const v of Object.values(dict)) expect(v.trim()).not.toBe('');
  });
});
