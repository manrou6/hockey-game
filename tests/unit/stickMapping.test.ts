import { describe, expect, it } from 'vitest';
import { mapStick, type MappedStick } from '../../src/input/stickMapping';

const P = { deadZone: 0.12, curve: 1.5, threshold: 0.9, hysteresis: 0.04 };
const out = (): MappedStick => ({ x: 0, y: 0, sprint: false });

describe('joystick mapping', () => {
  it('dead zone gives no movement', () => {
    const o = out();
    mapStick(0.1, 0, false, P, o);
    expect(o).toEqual({ x: 0, y: 0, sprint: false });
  });

  it('speed grows with travel up to the normal max at the threshold (no sprint)', () => {
    const o = out();
    let prev = 0;
    for (const r of [0.2, 0.4, 0.6, 0.8, 0.89]) {
      mapStick(r, 0, false, P, o);
      expect(o.sprint).toBe(false);
      expect(o.x).toBeGreaterThan(prev);
      prev = o.x;
    }
    expect(prev).toBeLessThan(1);
    expect(prev).toBeGreaterThan(0.95);
  });

  it('curve 1.5 gives finer control at low tilt than linear', () => {
    const curved = out();
    const linear = out();
    mapStick(0.4, 0, false, P, curved);
    mapStick(0.4, 0, false, { ...P, curve: 1 }, linear);
    expect(curved.x).toBeLessThan(linear.x);
  });

  it('sprints from the threshold, with hysteresis so it does not flicker', () => {
    const o = out();
    mapStick(0, 0.92, false, P, o);
    expect(o.sprint).toBe(true);
    expect(o.y).toBe(1);
    mapStick(0, 0.88, true, P, o); // slight wobble back: still sprinting
    expect(o.sprint).toBe(true);
    mapStick(0, 0.85, true, P, o); // clearly back: normal speed
    expect(o.sprint).toBe(false);
    mapStick(0, 0.88, false, P, o); // not yet over the threshold
    expect(o.sprint).toBe(false);
  });

  it('a threshold above 100% needs dragging beyond the ring edge', () => {
    const o = out();
    const beyond = { ...P, threshold: 1.15 };
    mapStick(1, 0, false, beyond, o);
    expect(o.sprint).toBe(false);
    mapStick(1.2, 0, false, beyond, o);
    expect(o.sprint).toBe(true);
  });

  it('keeps the direction', () => {
    const o = out();
    mapStick(-0.5, 0.5, false, P, o);
    expect(Math.atan2(o.y, o.x)).toBeCloseTo((3 * Math.PI) / 4, 6);
  });
});
