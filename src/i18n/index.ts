import ca from './ca.json';
import es from './es.json';
import en from './en.json';

export const LANGUAGES = ['ca', 'es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export type MessageKey = keyof typeof ca;

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { ca, es, en };
const DEFAULT_LANGUAGE: Language = 'ca';

let current: Language = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate a key; `{name}` placeholders are replaced from `params`. Falls back to Catalan. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text = DICTIONARIES[current][key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

/** Fill every element carrying `data-i18n="key"` under `root` with its translation. */
export function translateDom(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as MessageKey);
  });
  // Accessible labels for icon-only buttons.
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as MessageKey));
  });
}
