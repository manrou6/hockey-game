import { beforeEach, describe, expect, it } from 'vitest';
import { TuningOverrides, type KeyValueStorage } from '../../src/game/tuningOverrides';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

const KEY = 'patins.tuning.v1';
const makeDefaults = () => ({ skating: { maxSpeed: 7.5, accel: 10 }, camera: { fov: 0.6 } });

describe('tuning overrides', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('stores only the values the player changed', () => {
    const target = makeDefaults();
    const o = new TuningOverrides(target, makeDefaults(), storage);
    o.load();
    o.set('skating.maxSpeed', 8.2);
    expect(target.skating.maxSpeed).toBe(8.2);
    const saved = JSON.parse(storage.getItem(KEY)!);
    expect(Object.keys(saved)).toEqual(['skating.maxSpeed']);
    expect(saved['skating.maxSpeed']).toEqual({ v: 8.2, base: 7.5 });
  });

  it('setting a value back to the factory value removes it', () => {
    const target = makeDefaults();
    const o = new TuningOverrides(target, makeDefaults(), storage);
    o.load();
    o.set('skating.maxSpeed', 8.2);
    o.set('skating.maxSpeed', 7.5);
    expect(o.isModified('skating.maxSpeed')).toBe(false);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('saved overrides are applied on the next load', () => {
    new TuningOverrides(makeDefaults(), makeDefaults(), storage).set('camera.fov', 0.7);
    const target = makeDefaults();
    const o = new TuningOverrides(target, makeDefaults(), storage);
    o.load();
    expect(target.camera.fov).toBe(0.7);
    expect(o.modifiedPaths()).toEqual(['camera.fov']);
    expect(o.stale).toEqual([]);
  });

  it('drops an override whose factory value changed in a new build, and reports it', () => {
    const first = new TuningOverrides(makeDefaults(), makeDefaults(), storage);
    first.set('skating.maxSpeed', 8.2);
    first.set('skating.accel', 12);
    // New build: Claude changed the default of maxSpeed (7.5 → 8.0) but not accel.
    const newDefaults = makeDefaults();
    newDefaults.skating.maxSpeed = 8.0;
    const target = JSON.parse(JSON.stringify(newDefaults)) as ReturnType<typeof makeDefaults>;
    const o = new TuningOverrides(target, newDefaults, storage);
    o.load();
    expect(o.stale).toEqual(['skating.maxSpeed']);
    expect(target.skating.maxSpeed).toBe(8.0); // new factory value wins
    expect(target.skating.accel).toBe(12); // untouched override survives
    expect(Object.keys(JSON.parse(storage.getItem(KEY)!))).toEqual(['skating.accel']);
  });

  it('reset and resetAll restore factory values', () => {
    const target = makeDefaults();
    const o = new TuningOverrides(target, makeDefaults(), storage);
    o.load();
    o.set('skating.maxSpeed', 9);
    o.set('skating.accel', 14);
    o.reset('skating.accel');
    expect(target.skating.accel).toBe(10);
    o.resetAll();
    expect(target.skating.maxSpeed).toBe(7.5);
    expect(o.modifiedPaths()).toEqual([]);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('ignores corrupt storage, unknown and disallowed paths', () => {
    storage.setItem(KEY, '{not json');
    const o1 = new TuningOverrides(makeDefaults(), makeDefaults(), storage);
    expect(() => o1.load()).not.toThrow();
    storage.setItem(KEY, JSON.stringify({ 'nope.x': { v: 1, base: 1 }, 'camera.fov': { v: 0.7, base: 0.6 } }));
    const target = makeDefaults();
    const o2 = new TuningOverrides(target, makeDefaults(), storage, KEY, new Set(['skating.maxSpeed']));
    o2.load();
    expect(target.camera.fov).toBe(0.6);
    expect(o2.modifiedPaths()).toEqual([]);
  });

  it('exports a readable summary for the chat', () => {
    const o = new TuningOverrides(makeDefaults(), makeDefaults(), storage);
    o.set('skating.maxSpeed', 8.2);
    expect(o.exportText('v0.1.1')).toBe('PATINS tuning v0.1.1\nskating.maxSpeed = 8.2 (default 7.5)');
  });

  it("when the new factory value IS the player's saved value, it is adopted silently (no notice)", () => {
    new TuningOverrides(makeDefaults(), makeDefaults(), storage).set('skating.maxSpeed', 8.2);
    const newDefaults = makeDefaults();
    newDefaults.skating.maxSpeed = 8.2; // Claude fixed the player's value as factory
    const target = JSON.parse(JSON.stringify(newDefaults)) as ReturnType<typeof makeDefaults>;
    const o = new TuningOverrides(target, newDefaults, storage);
    o.load();
    expect(o.stale).toEqual([]);
    expect(target.skating.maxSpeed).toBe(8.2);
    expect(o.modifiedPaths()).toEqual([]);
    expect(storage.getItem(KEY)).toBeNull();
  });
});
