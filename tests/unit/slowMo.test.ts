import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import { SlowMo, slowMoGameTime, slowMoScale, type SlowMoTuning } from '../../src/game/slowMo';
import { createWorld, type WorldState } from '../../src/sim/world';

// F1.5e: slow-mo of the remate en el aire (src/game/slowMo.ts): a time scale for the loop only.

const K = TUNING.slowMo;

/** Real seconds that `gameSeconds` of game time take once a slow-mo has run for `fromGame` s of game time. */
function realFor(fromGame: number, gameSeconds: number, k: SlowMoTuning): number {
  const dt = 1 / 4000;
  let g = 0;
  let t = 0;
  while (g < fromGame) {
    g += slowMoScale(t, k) * dt;
    t += dt;
  }
  const start = t;
  while (g < fromGame + gameSeconds) {
    g += slowMoScale(t, k) * dt;
    t += dt;
  }
  return t - start;
}

/** A ball in the air coming to the controlled player's stick, `time` s (game time) away. */
function coming(w: WorldState, time: number): void {
  w.ball.owner = -1;
  const v = w.volley;
  v.found = v.incoming = true;
  v.open = time <= TUNING.volley.windowTime / 2;
  v.time = time;
  v.contactTick = -1;
}

describe('slow-mo profile', () => {
  it('eases down to `scale`, stays, eases back up to 1, and lasts `duration` s of real time', () => {
    expect(slowMoScale(-0.01, K)).toBe(1);
    expect(slowMoScale(0, K)).toBe(1);
    expect(slowMoScale(K.rampIn / 2, K)).toBeLessThan(1);
    expect(slowMoScale(K.rampIn / 2, K)).toBeGreaterThan(K.scale);
    expect(slowMoScale(K.duration / 2, K)).toBeCloseTo(K.scale, 9);
    expect(slowMoScale(K.duration - K.rampOut / 2, K)).toBeGreaterThan(K.scale);
    expect(slowMoScale(K.duration, K)).toBe(1);
    expect(K.duration).toBeLessThanOrEqual(0.35);
    expect(K.scale).toBeGreaterThanOrEqual(0.6);
    expect(K.scale).toBeLessThanOrEqual(0.7);
  });
  it('never jumps: the scale changes smoothly frame to frame', () => {
    let prev = 1;
    for (let t = 0; t <= K.duration + 0.01; t += 1 / 120) {
      const s = slowMoScale(t, K);
      expect(Math.abs(s - prev)).toBeLessThan(0.1);
      prev = s;
    }
  });
  it('the ramps shrink to fit a short slow-mo', () => {
    const k = { ...K, duration: 0.1, rampIn: 0.1, rampOut: 0.1 };
    expect(slowMoScale(0.05, k)).toBeCloseTo(k.scale, 9);
    expect(slowMoScale(0.1, k)).toBe(1);
  });
  it('the good timing (±volley.good of game time around the contact) lasts longer in real time', () => {
    const good = TUNING.volley.good;
    // The slow-mo starts `lead` s of game time before the contact.
    const real = realFor(K.lead - good, 2 * good, K);
    expect(real).toBeGreaterThan(2 * good * 1.25);
    expect(real).toBeLessThan((2 * good) / K.scale + 1e-6);
    expect(slowMoGameTime(K.duration, K)).toBeLessThan(K.duration);
  });
  it('v0.1.29: it starts as the TIR window opens and slows the approach: the ball gets to the stick ≥ 0.1 s later', () => {
    expect(K.lead).toBeCloseTo(TUNING.volley.windowTime / 2, 9);
    // Real time from the start to the contact (lead s of game time), against lead s without it.
    expect(realFor(0, K.lead, K) - K.lead).toBeGreaterThanOrEqual(0.1);
    // Most of the slow-mo is before the contact (v0.1.28: ~60 % after it).
    expect(realFor(0, K.lead, K)).toBeGreaterThan(K.duration * 0.75);
  });
});

describe('slow-mo driver', () => {
  it('starts `lead` s before a ball in the air gets to the controlled player\'s stick, once per ball', () => {
    const w = createWorld(3, 0);
    const s = new SlowMo();
    coming(w, 0.3);
    expect(s.update(w, 1 / 60, K)).toBe(1); // still too far
    coming(w, K.lead);
    s.update(w, 1 / 60, K);
    expect(s.update(w, 1 / 60, K)).toBeLessThan(1);
    let frames = 2;
    while (s.update(w, 1 / 60, K) < 1 && frames < 100) frames++;
    expect(frames / 60).toBeLessThanOrEqual(K.duration + 2 / 60);
    // The same ball (still found, still close): no second slow-mo.
    coming(w, K.lead / 2);
    expect(s.update(w, 1 / 60, K)).toBe(1);
    // Once no ball is coming, the next one gets its own.
    w.volley.found = false;
    s.update(w, 1 / 60, K);
    coming(w, K.lead);
    s.update(w, 1 / 60, K);
    expect(s.update(w, 1 / 60, K)).toBeLessThan(1);
  });
  it('off in the panel (enabled 0): never', () => {
    const w = createWorld(3, 0);
    const s = new SlowMo();
    coming(w, K.lead);
    for (let i = 0; i < 10; i++) expect(s.update(w, 1 / 60, { ...K, enabled: 0 })).toBe(1);
  });
  it('not for a ball someone has', () => {
    const w = createWorld(3, 0);
    const s = new SlowMo();
    coming(w, K.lead);
    w.ball.owner = 0;
    for (let i = 0; i < 10; i++) expect(s.update(w, 1 / 60, K)).toBe(1);
  });
});
