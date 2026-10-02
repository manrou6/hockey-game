/**
 * Player-saved tuning overrides (CLAUDE.md: tune "game feel" on the phone).
 *
 * Only values the player changed are stored, each together with the factory value it
 * was changed FROM (`base`). If a later build ships a different factory value for that
 * path, the saved override is stale: it is dropped (so it never hides the new default)
 * and reported so the UI can tell the player.
 */

export interface StoredOverride {
  /** Value chosen by the player (stored units). */
  v: number;
  /** Factory value when the player changed it. */
  base: number;
}

export type OverrideMap = Record<string, StoredOverride>;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Tree = Record<string, unknown>;

const EPS = 1e-9;
export const sameValue = (a: number, b: number): boolean => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

export function getAt(obj: object, path: string): number | undefined {
  const [section, key] = path.split('.');
  const sec = (obj as Tree)[section ?? ''] as Tree | undefined;
  const v = sec?.[key ?? ''];
  return typeof v === 'number' ? v : undefined;
}

export function setAt(obj: object, path: string, value: number): void {
  const [section, key] = path.split('.');
  const sec = (obj as Tree)[section ?? ''] as Tree | undefined;
  if (sec && key && typeof sec[key] === 'number') sec[key] = value;
}

function parse(raw: string | null): OverrideMap {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return {};
    const out: OverrideMap = {};
    for (const [path, o] of Object.entries(data as Record<string, unknown>)) {
      const rec = o as Partial<StoredOverride> | null;
      if (rec && typeof rec.v === 'number' && Number.isFinite(rec.v) && typeof rec.base === 'number') {
        out[path] = { v: rec.v, base: rec.base };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export class TuningOverrides {
  private map: OverrideMap = {};
  /** Paths whose saved value was dropped at load because the factory value changed. */
  readonly stale: string[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly target: object,
    private readonly defaults: object,
    private readonly storage: KeyValueStorage | null,
    private readonly storageKey = 'patins.tuning.v1',
    /** Only these paths may be overridden (the ones the panel exposes). */
    private readonly allowed: ReadonlySet<string> | null = null,
  ) {}

  /** Read saved overrides and apply the still-valid ones onto `target`. */
  load(): void {
    let stored: OverrideMap = {};
    try {
      stored = parse(this.storage?.getItem(this.storageKey) ?? null);
    } catch {
      stored = {};
    }
    this.map = {};
    this.stale.length = 0;
    for (const [path, o] of Object.entries(stored)) {
      const def = getAt(this.defaults, path);
      if (def === undefined || (this.allowed && !this.allowed.has(path))) continue;
      if (!sameValue(def, o.base)) {
        this.stale.push(path);
        continue;
      }
      if (sameValue(def, o.v)) continue;
      this.map[path] = o;
      setAt(this.target, path, o.v);
    }
    // Persist the cleaned map (stale entries removed).
    this.save();
  }

  get(path: string): number | undefined {
    return getAt(this.target, path);
  }

  defaultOf(path: string): number | undefined {
    return getAt(this.defaults, path);
  }

  isModified(path: string): boolean {
    return path in this.map;
  }

  modifiedPaths(): string[] {
    return Object.keys(this.map);
  }

  /** Set a value; storing it only if it differs from the factory value. */
  set(path: string, value: number): void {
    const def = getAt(this.defaults, path);
    if (def === undefined || !Number.isFinite(value)) return;
    setAt(this.target, path, value);
    if (sameValue(def, value)) delete this.map[path];
    else this.map[path] = { v: value, base: def };
    this.save();
    this.emit();
  }

  reset(path: string): void {
    const def = getAt(this.defaults, path);
    if (def === undefined) return;
    this.set(path, def);
  }

  resetAll(): void {
    for (const path of Object.keys(this.map)) {
      const def = getAt(this.defaults, path);
      if (def !== undefined) setAt(this.target, path, def);
    }
    this.map = {};
    this.save();
    this.emit();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Plain-text summary to paste into the chat with Claude. */
  exportText(version: string): string {
    const lines = [`PATINS tuning ${version}`];
    const paths = this.modifiedPaths().sort();
    if (paths.length === 0) lines.push('(no changes)');
    for (const p of paths) lines.push(`${p} = ${round(this.map[p]!.v)} (default ${round(this.map[p]!.base)})`);
    return lines.join('\n');
  }

  private save(): void {
    try {
      if (Object.keys(this.map).length === 0) this.storage?.removeItem(this.storageKey);
      else this.storage?.setItem(this.storageKey, JSON.stringify(this.map));
    } catch {
      /* storage unavailable: changes still apply for this session */
    }
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
