import { describe, expect, it } from 'vitest';
import { TUNING, TUNING_DEFAULTS } from '../../src/config/tuning';
import {
  BroadcastRigPreset,
  CameraDirector,
  smoothstep,
  type CameraContext,
  type CameraPose,
  type CameraPreset,
  type CameraPresetId,
} from '../../src/render/cameraPresets';

const ctx = (over: Partial<CameraContext> = {}): CameraContext => ({
  playerX: 0, playerZ: 0, playerVx: 0, playerVz: 0,
  ballX: 0, ballZ: 0, ballVx: 0, ballVz: 0, dt: 1 / 60, ...over,
});

function director(initial: CameraPresetId = 'tv'): CameraDirector {
  const list: CameraPreset[] = [
    new BroadcastRigPreset('tv', () => TUNING.cameraTv),
    new BroadcastRigPreset('close', () => TUNING.cameraClose),
    new BroadcastRigPreset('tactical', () => TUNING.cameraTactical),
  ];
  return new CameraDirector(new Map(list.map((p) => [p.id, p])), initial, () => TUNING.camera.transitionTime);
}

function settle(d: CameraDirector, c: CameraContext, seconds = 5): CameraPose {
  let pose = d.update(c);
  for (let i = 0; i < seconds * 60; i++) pose = d.update(c);
  return { ...pose };
}

const dist = (a: CameraPose, b: CameraPose): number => Math.hypot(a.px - b.px, a.py - b.py, a.pz - b.pz);

describe('camera presets', () => {
  it('TV, close and tactical have distinct framings', () => {
    const c = ctx();
    const tv = settle(director('tv'), c);
    const close = settle(director('close'), c);
    const tactical = settle(director('tactical'), c);
    expect(tactical.py).toBeGreaterThan(tv.py);
    expect(close.py).toBeLessThan(tv.py);
    // Close camera is nearer to the action than TV.
    expect(Math.hypot(close.px, close.py, close.pz)).toBeLessThan(Math.hypot(tv.px, tv.py, tv.pz));
    // Tactical opens the view (wider field of view) compared with TV.
    expect(tactical.fov).toBeGreaterThan(tv.fov);
  });

  it('the close camera follows the action across the rink width; the TV camera stays in the stand', () => {
    const c = ctx({ playerZ: 6, ballZ: 6 });
    const tv = settle(director('tv'), c);
    const close = settle(director('close'), c);
    expect(tv.pz).toBeCloseTo(-TUNING.cameraTv.distance, 5);
    expect(close.pz).toBeGreaterThan(-TUNING.cameraClose.distance + 2);
  });

  it('switching preset blends smoothly: no jump, then arrives at the new framing', () => {
    const c = ctx({ playerX: 5, ballX: 6 });
    const d = director('tv');
    let prev = settle(d, c);
    d.setPreset('close');
    expect(d.transitioning).toBe(true);
    const frames = Math.ceil((TUNING.camera.transitionTime + 0.1) * 60);
    let maxStep = 0;
    for (let i = 0; i < frames; i++) {
      const p = { ...d.update(c) };
      maxStep = Math.max(maxStep, dist(p, prev));
      prev = p;
    }
    expect(d.transitioning).toBe(false);
    // The camera moves ~12 m in ~0.6 s: no single frame may jump more than ~0.6 m.
    expect(maxStep).toBeLessThan(0.6);
    const target = settle(director('close'), c);
    expect(dist(settle(d, c, 2), target)).toBeLessThan(0.01);
    expect(d.activeId).toBe('close');
  });

  it('the first frame after switching is continuous with the last frame before', () => {
    const c = ctx();
    const d = director('tactical');
    const before = settle(d, c);
    d.setPreset('tv');
    const after = d.update(c);
    expect(dist(after, before)).toBeLessThan(0.2);
  });

  it('live tuning changes apply on the next frame', () => {
    const c = ctx();
    const d = director('tv');
    settle(d, c);
    TUNING.cameraTv.height = 14;
    try {
      expect(d.update(c).py).toBe(14);
    } finally {
      TUNING.cameraTv.height = TUNING_DEFAULTS.cameraTv.height;
    }
  });

  it('smoothstep eases in and out', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5);
    expect(smoothstep(0.05)).toBeLessThan(0.05);
  });
});
