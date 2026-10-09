import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import { vibrationPattern, VolleyFeedback } from '../../src/game/volleyFeedback';
import { createWorld, type WorldState } from '../../src/sim/world';

// v0.1.29: the live diagnosis of the remate en el aire and the vibration of a perfect strike.

/** The controlled player strikes the ball in the air with this timing (s). */
function strike(w: WorldState, timing: number): void {
  w.tick += 1;
  w.lastShotTick = w.tick;
  w.lastShotPlayer = w.controlled;
  w.lastShot.aerial = true;
  w.lastShot.timing = timing;
}

/** A ball in the air coming to the controlled player's stick, window open. */
function windowOpen(w: WorldState, height = 0.6): void {
  w.ball.owner = -1;
  w.ball.x = w.players[w.controlled]!.x + 3;
  w.ball.y = w.players[w.controlled]!.y + 4;
  w.volley.found = w.volley.open = true;
  w.volley.height = height;
}

describe('vibration of a perfect remate en el aire', () => {
  it('pattern from the panel values: a pulse, a gap and a tail (none if the tail is 0)', () => {
    expect(vibrationPattern({ volleyMs: 32, volleyGapMs: 45, volleyTailMs: 14 })).toEqual([32, 45, 14]);
    expect(vibrationPattern({ volleyMs: 30, volleyGapMs: 45, volleyTailMs: 0 })).toEqual([30]);
    expect(vibrationPattern({ volleyMs: 0, volleyGapMs: 45, volleyTailMs: 14 })).toEqual([]);
    const k = TUNING.haptics;
    expect(k.volleyMs).toBeGreaterThanOrEqual(25);
    expect(k.volleyMs).toBeLessThanOrEqual(40);
  });
  it('vibrates on a strike with good timing, not on a bad one, nor with Vibració off', () => {
    const w = createWorld(1, 0);
    const calls: number[][] = [];
    const fb = new VolleyFeedback(w, (p) => calls.push(p));
    strike(w, TUNING.volley.good / 2);
    fb.update(w, 1, TUNING, true);
    expect(calls).toEqual([vibrationPattern(TUNING.haptics)]);
    strike(w, TUNING.volley.good + 0.05);
    fb.update(w, 1, TUNING, true);
    expect(calls.length).toBe(1);
    strike(w, 0);
    fb.update(w, 1, TUNING, false);
    expect(calls.length).toBe(1);
    // A normal (not aerial) shot never vibrates.
    w.tick += 1;
    w.lastShotTick = w.tick;
    w.lastShot.aerial = false;
    w.lastShot.timing = 0;
    fb.update(w, 1, TUNING, true);
    expect(calls.length).toBe(1);
  });
});

describe('live diagnosis', () => {
  it('counts the windows, keeps the last one (height, distance, timing) and the time scale', () => {
    const w = createWorld(1, 0);
    const fb = new VolleyFeedback(w, () => {});
    fb.update(w, 1, TUNING, true);
    expect(fb.diagnosis.open).toBe(false);
    expect(fb.diagnosis.opens).toBe(0);
    windowOpen(w, 0.62);
    fb.update(w, 0.65, TUNING, true);
    fb.update(w, 0.65, TUNING, true);
    expect(fb.diagnosis.open).toBe(true);
    expect(fb.diagnosis.opens).toBe(1);
    expect(fb.diagnosis.scale).toBe(0.65);
    expect(fb.diagnosis.lastHeight).toBeCloseTo(0.62, 9);
    expect(fb.diagnosis.lastDistance).toBeCloseTo(5, 9);
    expect(Number.isNaN(fb.diagnosis.lastTiming)).toBe(true);
    strike(w, -0.03);
    w.volley.open = false;
    fb.update(w, 1, TUNING, true);
    expect(fb.diagnosis.open).toBe(false);
    expect(fb.diagnosis.lastTiming).toBeCloseTo(-0.03, 9);
    windowOpen(w);
    fb.update(w, 1, TUNING, true);
    expect(fb.diagnosis.opens).toBe(2);
  });
});
