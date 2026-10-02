import { TUNING_PARAMS, TUNING_SECTIONS, type TuningParamMeta } from '../config/tuningMeta';
import { APP_VERSION } from '../config/version';
import type { TuningOverrides } from '../game/tuningOverrides';
import { onLanguageChange, t, translateDom, type MessageKey } from '../i18n';
import { el } from './dom';

/** Decimals needed to show a value with the given step (0.05 → 2). */
function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

interface Row {
  meta: TuningParamMeta;
  root: HTMLElement;
  value: HTMLElement;
  factory: HTMLElement;
  slider: HTMLInputElement;
  resetBtn: HTMLButtonElement;
}

/**
 * Touch-friendly tuning drawer (right side) to adjust "game feel" numbers on the phone
 * while playing. Changes apply instantly and persist (only changed values) through
 * TuningOverrides; "Copy values" produces a text to paste in the chat with Claude.
 */
export class TuningPanel {
  readonly element: HTMLElement;
  private readonly rows: Row[] = [];
  private readonly countLabel: HTMLElement;
  private readonly copyStatus: HTMLElement;
  private readonly copyBox: HTMLTextAreaElement;

  constructor(private readonly overrides: TuningOverrides) {
    this.countLabel = el('span', { className: 'tp-count' });
    const close = el('button', { className: 'tp-icon-btn', attrs: { id: 'tp-close', 'data-i18n-aria': 'common.close' } }, ['✕']);
    close.addEventListener('click', () => this.close());

    const copy = el('button', { className: 'tp-btn', i18n: 'tuning.copy', attrs: { id: 'tp-copy' } });
    copy.addEventListener('click', () => void this.copyValues());
    const resetAll = el('button', { className: 'tp-btn', i18n: 'tuning.resetAll', attrs: { id: 'tp-reset-all' } });
    resetAll.addEventListener('click', () => {
      if (this.overrides.modifiedPaths().length === 0 || window.confirm(t('tuning.resetAllConfirm'))) this.overrides.resetAll();
    });
    this.copyStatus = el('p', { className: 'tp-status' });
    this.copyBox = el('textarea', { className: 'tp-copybox', attrs: { readonly: '', rows: '4' } });
    this.copyBox.hidden = true;

    const body = el('div', { className: 'tp-body' });
    TUNING_SECTIONS.forEach((section, i) => {
      const details = el('details', { className: 'tp-section' });
      details.open = i === 0;
      details.append(el('summary', { i18n: `tuning.section.${section.id}` }));
      for (const meta of section.params) details.append(this.buildRow(meta));
      body.append(details);
    });

    this.element = el('div', { className: 'tuning-panel', attrs: { id: 'tuning-panel' } }, [
      el('div', { className: 'tp-sticky' }, [
        el('div', { className: 'tp-header' }, [el('h2', { i18n: 'tuning.title' }), this.countLabel, close]),
        el('div', { className: 'tp-actions' }, [copy, resetAll]),
        this.copyStatus,
        this.copyBox,
      ]),
      body,
    ]);
    this.element.hidden = true;

    this.overrides.onChange(() => this.refresh());
    onLanguageChange(() => this.refresh());
    this.refresh();
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
    this.refresh();
  }

  close(): void {
    this.element.hidden = true;
    this.copyBox.hidden = true;
    this.copyStatus.textContent = '';
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private buildRow(meta: TuningParamMeta): HTMLElement {
    const value = el('span', { className: 'tp-value' });
    const factory = el('span', { className: 'tp-factory' });
    const resetBtn = el('button', { className: 'tp-icon-btn tp-reset', attrs: { 'data-i18n-aria': 'tuning.reset' } }, ['↺']);
    resetBtn.addEventListener('click', () => this.overrides.reset(meta.path));
    const slider = el('input', {
      className: 'tp-slider',
      attrs: { type: 'range', min: String(meta.min), max: String(meta.max), step: String(meta.step), 'data-path': meta.path },
    });
    slider.addEventListener('input', () => this.setDisplay(meta, Number(slider.value)));
    const minus = this.stepButton('−', meta, -1);
    const plus = this.stepButton('+', meta, +1);

    const root = el('div', { className: 'tp-row', attrs: { 'data-path': meta.path } }, [
      el('div', { className: 'tp-row-head' }, [el('span', { className: 'tp-label', i18n: (meta.labelKey ?? `tuning.${meta.path}`) as MessageKey }), value, resetBtn]),
      el('div', { className: 'tp-row-ctrl' }, [minus, slider, plus]),
      factory,
    ]);
    this.rows.push({ meta, root, value, factory, slider, resetBtn });
    return root;
  }

  /** −/+ buttons; holding them repeats. */
  private stepButton(label: string, meta: TuningParamMeta, dir: 1 | -1): HTMLButtonElement {
    const b = el('button', { className: 'tp-step' }, [label]);
    let timer: number | undefined;
    const stepOnce = (): void => {
      const current = (this.overrides.get(meta.path) ?? 0) * (meta.scale ?? 1);
      this.setDisplay(meta, current + dir * meta.step);
    };
    const stop = (): void => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stepOnce();
      stop();
      let n = 0;
      timer = window.setInterval(() => {
        if (++n > 4) stepOnce(); // short delay before auto-repeat
      }, 90);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('pointerleave', stop);
    return b;
  }

  /** Set a value expressed in display units (snapped to the step and clamped). */
  private setDisplay(meta: TuningParamMeta, display: number): void {
    const d = decimalsOf(meta.step);
    const snapped = Math.min(meta.max, Math.max(meta.min, Math.round(display / meta.step) * meta.step));
    const clean = Number(snapped.toFixed(d));
    this.overrides.set(meta.path, clean / (meta.scale ?? 1));
  }

  private format(meta: TuningParamMeta, stored: number): string {
    const v = stored * (meta.scale ?? 1);
    return `${v.toFixed(decimalsOf(meta.step))}${meta.unit ? ` ${meta.unit}` : ''}`;
  }

  private refresh(): void {
    translateDom(this.element);
    const n = this.overrides.modifiedPaths().length;
    this.countLabel.textContent = n > 0 ? t('tuning.modified', { n }) : '';
    for (const r of this.rows) {
      const v = this.overrides.get(r.meta.path) ?? 0;
      const def = this.overrides.defaultOf(r.meta.path) ?? 0;
      const modified = this.overrides.isModified(r.meta.path);
      r.value.textContent = this.format(r.meta, v);
      r.factory.textContent = modified ? t('tuning.factory', { value: this.format(r.meta, def) }) : '';
      r.root.classList.toggle('modified', modified);
      r.resetBtn.hidden = !modified;
      // Don't fight the finger while dragging the slider.
      if (document.activeElement !== r.slider) r.slider.value = String(v * (r.meta.scale ?? 1));
    }
  }

  private async copyValues(): Promise<void> {
    const text = this.overrides.exportText(APP_VERSION);
    try {
      await navigator.clipboard.writeText(text);
      this.copyBox.hidden = true;
      this.copyStatus.textContent = t('tuning.copied');
    } catch {
      // Clipboard blocked: show the text so it can be copied by hand.
      this.copyStatus.textContent = t('tuning.copyFallback');
      this.copyBox.value = text;
      this.copyBox.hidden = false;
      this.copyBox.select();
    }
  }
}

/** Human label for a tuning path; shared labels get their section name ("Càmera propera: Alçada"). */
export function tuningLabel(path: string): string {
  const meta = TUNING_PARAMS.find((p) => p.path === path);
  if (!meta?.labelKey) return t(`tuning.${path}` as MessageKey);
  const section = path.split('.')[0] ?? '';
  return `${t(`tuning.section.${section}` as MessageKey)}: ${t(meta.labelKey as MessageKey)}`;
}

/** One-off notice listing saved overrides dropped because their factory value changed. */
export function createStaleNotice(paths: string[]): HTMLElement | null {
  if (paths.length === 0) return null;
  const list = (): string => paths.map(tuningLabel).join(', ');
  const text = el('p', { attrs: { id: 'stale-notice-text' } }, [t('tuning.staleNotice', { list: list() })]);
  const ok = el('button', { className: 'btn-secondary', i18n: 'common.ok', attrs: { id: 'stale-notice-ok' } });
  const box = el('div', { className: 'notice', attrs: { id: 'stale-notice', role: 'alert' } }, [text, ok]);
  ok.addEventListener('click', () => box.remove());
  onLanguageChange(() => {
    text.textContent = t('tuning.staleNotice', { list: list() });
  });
  return box;
}
