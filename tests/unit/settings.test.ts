import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from '../../src/ui/settings';

// A tiny in-memory localStorage (the unit tests run in Node).
function stubStorage(initial: Record<string, string> = {}): Record<string, string> {
  const data = { ...initial };
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (k in data ? data[k]! : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => undefined,
    key: () => null,
    length: 0,
  } as Storage;
  return data;
}

const KEY = 'patins.settings.v1';

describe('settings: pass assist default (v0.1.21: Mitjana)', () => {
  beforeEach(() => {
    stubStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('Mitjana is the default', () => {
    expect(loadSettings().assist).toBe('medium');
  });

  it('the shot reticle (F1.5a) is on by default, and switching it off is remembered', () => {
    expect(loadSettings().shotReticle).toBe(true);
    saveSettings({ ...loadSettings(), shotReticle: false });
    expect(loadSettings().shotReticle).toBe(false);
  });

  it('settings saved before the change (old default Lleugera, no revision) move to Mitjana once', () => {
    stubStorage({ [KEY]: JSON.stringify({ language: 'es', assist: 'light', passArrow: false }) });
    const s = loadSettings();
    expect(s.assist).toBe('medium');
    expect(s.language).toBe('es'); // the rest is kept
    expect(s.passArrow).toBe(false);
  });

  it('a choice made after the change is kept (also Lleugera)', () => {
    saveSettings({ ...loadSettings(), assist: 'light' });
    expect(loadSettings().assist).toBe('light');
    saveSettings({ ...loadSettings(), assist: 'strong' });
    expect(loadSettings().assist).toBe('strong');
  });

  it('an invalid saved value falls back to the default', () => {
    stubStorage({ [KEY]: JSON.stringify({ assist: 'huge', assistRev: 2 }) });
    expect(loadSettings().assist).toBe('medium');
  });
});
