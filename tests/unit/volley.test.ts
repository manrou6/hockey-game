import { describe, expect, it } from 'vitest';
import { goalLineX, RINK } from '../../src/config/rink';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { createBall } from '../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { bladePoint } from '../../src/sim/dribble';
import { createPlayer } from '../../src/sim/player';
import { createVolleyContact, predictContact, volleyPowerFactor, volleyTimingFactor } from '../../src/sim/volley';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

// F1.5d: remate en el aire / volea (docs/03 §3).

const GX = goalLineX(1);
const R = RINK.ballRadius;
const V = TUNING.volley;

function tuningWith(patch: (t: Tuning) => void): Tuning {
  const t = structuredClone(TUNING);
  patch(t);
  return t;
}

/** No random error: geometry and speeds exactly. */
const exact = (t: Tuning): void => {
  t.shot.errorBase = t.shot.errorSprint = t.shot.errorOffBalance = t.shot.errorTurn = t.shot.errorRedirect = 0;
  t.shot.errorPower = 0;
};

/**
 * The human's player 7 m in front of the goal, a bit to the side, facing a ball that comes to his
 * blade from the front-side at `speed` m/s, getting there at `height` m above the floor after
 * `time` s.
 */
function delivery(tuning: Tuning, speed = 10, height = 0.45, time = 0.45): { w: WorldState; contactTick: number } {
  const w = createWorld(7, 0);
  const p = w.players[0]!;
  p.x = p.prevX = GX - 7;
  p.y = p.prevY = -1;
  const from = 0.7; // the ball comes from the front-left of the goal direction
  p.heading = p.prevHeading = from;
  p.vx = p.vy = 0;
  const b = bladePoint(p, tuning);
  w.ball.owner = -1;
  w.ball.x = w.ball.prevX = b.x + Math.cos(from) * speed * time;
  w.ball.y = w.ball.prevY = b.y + Math.sin(from) * speed * time;
  w.ball.z = w.ball.prevZ = R + height;
  w.ball.vx = -Math.cos(from) * speed;
  w.ball.vy = -Math.sin(from) * speed;
  w.ball.vz = (9.81 * time) / 2;
  w.passTo = 0;
  w.meetX = b.x;
  w.meetY = b.y;
  // When does the world say the ball gets to his stick? (a dry run: nobody presses TIRO)
  const dry = structuredClone(w);
  let contactTick = -1;
  for (let i = 0; i < 60 && contactTick < 0; i++) {
    stepWorld(dry, [emptyCommand()], tuning);
    if (dry.volley.found && dry.volley.time < 0.5 / 60) contactTick = dry.tick - 1;
  }
  return { w, contactTick };
}

const cmd = (extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), ...extra });

/** Tap TIRO so that it is released at world tick `release` (pressed 6 ticks before), stick towards the goal. */
function tapAt(w: WorldState, tuning: Tuning, release: number, ticks = 60): void {
  const press = release - 6;
  for (let i = 0; i < ticks && w.lastShotTick < 0; i++) {
    const t = w.tick;
    const a = Math.atan2(-w.ball.y, GX - w.ball.x);
    stepWorld(w, [cmd({ moveX: Math.cos(a) * 0.15, moveY: Math.sin(a) * 0.15, shoot: t === press, shootHeld: t >= press && t < release })], tuning);
  }
}

describe('following the ball to the stick', () => {
  it('a ball in the air coming to his blade: found, with the time and the height of the contact', () => {
    const t = tuningWith(exact);
    const { w } = delivery(t, 10, 0.45);
    const out = predictContact(w.ball, w.players[0]!, t, createVolleyContact());
    expect(out.found).toBe(true);
    expect(out.time).toBeGreaterThan(0.3);
    expect(out.time).toBeLessThan(0.5);
    expect(out.height).toBeGreaterThan(0.3);
    expect(out.height).toBeLessThan(0.6);
  });
  it('a rolling ball passes within reach but is no remate en el aire (a normal first touch); nor a ball above maxHeight', () => {
    const p = createPlayer(0, 0, 0);
    const b = bladePoint(p, TUNING);
    const ball = createBall(b.x + 3, b.y);
    ball.vx = -10;
    const rolling = predictContact(ball, p, TUNING, createVolleyContact());
    expect(rolling.passes).toBe(true);
    expect(rolling.found).toBe(false);
    const high = createBall(b.x + 3, b.y);
    high.z = R + V.maxHeight + 0.3;
    high.vx = -10;
    high.vz = (9.81 * 0.3) / 2; // back at that height when it gets to him
    expect(predictContact(high, p, TUNING, createVolleyContact()).found).toBe(false);
  });
});

describe('remate en el aire (F1.5d)', () => {
  it('TIRO released right at the contact: struck in the air, good timing, the full power bonus', () => {
    const t = tuningWith(exact);
    const { w, contactTick } = delivery(t);
    expect(contactTick).toBeGreaterThan(10);
    tapAt(w, t, contactTick);
    expect(w.lastShot.aerial).toBe(true);
    expect(Math.abs(w.lastShot.timing)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(w.lastShot.speed).toBeGreaterThan(t.shot.quickSpeed * (1 + V.powerBonus * 0.75));
    expect(w.lastShot.contactHeight).toBeGreaterThan(0.2);
    // It goes at the goal.
    for (let i = 0; i < 60 && w.ball.x < GX; i++) stepWorld(w, [cmd()], t);
    expect(w.ball.x).toBeGreaterThanOrEqual(GX);
    expect(Math.abs(w.ball.y)).toBeLessThan(RINK.goalWidth / 2);
  });
  it('released early (within the window): struck at the contact, timing < 0; too early: no remate', () => {
    const t = tuningWith(exact);
    const a = delivery(t);
    tapAt(a.w, t, a.contactTick - 9);
    expect(a.w.lastShot.aerial).toBe(true);
    expect(a.w.lastShotTick).toBeGreaterThanOrEqual(a.contactTick);
    expect(a.w.lastShot.timing).toBeCloseTo(-9 / 60, 6);
    const b = delivery(t);
    tapAt(b.w, t, b.contactTick - Math.round((V.windowTime / 2) * 60) - 3);
    expect(b.w.lastShot.aerial).toBe(false);
  });
  it('released late with TIRO still held at the contact: the stick carries the ball and it leaves on the release (bad timing past good)', () => {
    const t = tuningWith(exact);
    const { w, contactTick } = delivery(t, 8);
    tapAt(w, t, contactTick + 8);
    expect(w.lastShot.aerial).toBe(true);
    expect(w.lastShot.timing).toBeGreaterThan(V.good);
    expect(w.lastShot.speed).toBeCloseTo(t.shot.quickSpeed, 6);
  });
  it('timing and power factors: 1 / +powerBonus at 0, error up to 1 + badError at the edge of the window', () => {
    expect(volleyTimingFactor(0, V)).toBe(1);
    expect(volleyTimingFactor(V.good, V)).toBe(1);
    expect(volleyTimingFactor(V.windowTime / 2, V)).toBeCloseTo(1 + V.badError, 9);
    expect(volleyPowerFactor(0, V)).toBeCloseTo(1 + V.powerBonus, 9);
    expect(volleyPowerFactor(V.good, V)).toBeCloseTo(1, 9);
    expect(volleyPowerFactor(-V.good / 2, V)).toBeCloseTo(1 + V.powerBonus / 2, 9);
  });
  it('the TIR window opens before the contact and fills its arc up to it (the HUD reads world.volley)', () => {
    const t = tuningWith(exact);
    const { w, contactTick } = delivery(t);
    let opened = -1;
    let lastProgress = 0;
    while (w.tick < contactTick) {
      stepWorld(w, [cmd()], t);
      if (w.volley.open && opened < 0) opened = w.tick;
      if (w.volley.open) {
        expect(w.volley.progress).toBeGreaterThanOrEqual(lastProgress - 1e-9);
        lastProgress = w.volley.progress;
      }
    }
    expect(opened).toBeGreaterThan(0);
    expect((contactTick - opened) / 60).toBeLessThanOrEqual(V.windowTime / 2 + 2 / 60);
    expect(lastProgress).toBeGreaterThan(0.85);
  });
  it('a ground pass is not a remate en el aire: the first touch of F1.5b as before', () => {
    const t = tuningWith(exact);
    const w = createWorld(5, 0);
    const p = w.players[0]!;
    p.x = p.prevX = GX - 7.5;
    p.y = p.prevY = -2;
    p.heading = p.prevHeading = Math.PI / 2;
    const b = bladePoint(p, t);
    w.ball.owner = -1;
    w.ball.x = w.ball.prevX = b.x;
    w.ball.y = w.ball.prevY = b.y + 2;
    w.ball.vy = -14;
    w.passTo = 0;
    w.meetX = b.x;
    w.meetY = b.y;
    stepWorld(w, [cmd({ shoot: true, shootHeld: true })], t);
    stepWorld(w, [cmd()], t);
    for (let i = 0; i < 60 && w.lastShotTick < 0; i++) stepWorld(w, [cmd({ moveX: 1 })], t);
    expect(w.lastShotTick).toBeGreaterThan(0);
    expect(w.lastShot.aerial).toBe(false);
    expect(w.lastShot.firstTouch).toBe(true);
  });
  it('is deterministic', () => {
    const go = (): number[] => {
      const { w, contactTick } = delivery(TUNING, 12, 0.3);
      tapAt(w, TUNING, contactTick + 1);
      for (let i = 0; i < 30; i++) stepWorld(w, [cmd()], TUNING);
      return [w.ball.x, w.ball.y, w.ball.z, w.lastShot.angle, w.lastShot.speed, w.lastShot.timing];
    };
    expect(go()).toEqual(go());
  });
});

describe('F1.5e: the real volley', () => {
  it('contact height: from volley.minHeight 0.15 m (below it is the first touch of F1.5b) up to maxHeight 1.50 m (the rule, art. 6.3)', () => {
    expect(V.minHeight).toBe(0.15);
    expect(V.maxHeight).toBe(1.5);
    const t = tuningWith(exact);
    // Skimming low (never above ~0.1 m near his stick): not a remate en el aire.
    const low = delivery(t, 10, 0.05, 0.2);
    expect(predictContact(low.w.ball, low.w.players[0]!, t, createVolleyContact()).found).toBe(false);
    const ok = delivery(t, 10, 0.25);
    const c = predictContact(ok.w.ball, ok.w.players[0]!, t, createVolleyContact());
    expect(c.found).toBe(true);
    expect(c.height).toBeGreaterThanOrEqual(V.minHeight);
    const high = delivery(t, 10, 1.3);
    expect(predictContact(high.w.ball, high.w.players[0]!, t, createVolleyContact()).found).toBe(true);
  });

  /** Player 0 (controlled) passes a driven lofted pass to teammate 1, `dist` m away, who stands still. */
  function drivenPass(tuning: Tuning, dist: number): WorldState {
    const w = createWorld(11, 1);
    const p = w.players[0]!;
    const r = w.players[1]!;
    p.x = p.prevX = GX - 7 - dist;
    p.y = p.prevY = 0;
    p.heading = p.prevHeading = 0;
    r.x = r.prevX = GX - 7;
    r.y = r.prevY = 0;
    r.heading = r.prevHeading = Math.PI;
    r.vx = r.vy = 0;
    const b = bladePoint(p, tuning);
    w.ball.x = w.ball.prevX = b.x;
    w.ball.y = w.ball.prevY = b.y;
    w.ball.owner = 0;
    w.controlled = 0;
    stepWorld(w, [cmd({ moveX: 0.3, pass: true, passHeld: false, passHeight: 1 })], tuning);
    expect(w.passTo).toBe(1);
    return w;
  }

  it('a teammate\'s driven lofted pass (12 m) gets to the receiver in the air; without TIRO he blocks it at his stick and keeps it', () => {
    const t = tuningWith((x) => {
      x.pass.errorBase = x.pass.errorSprint = x.pass.errorPressure = x.pass.errorOffBalance = x.pass.errorPower = 0;
      x.mates.move = 0;
    });
    const w = drivenPass(t, 12);
    expect(w.passAir).toBe(1);
    expect(w.controlled).toBe(1); // the control goes to the receiver as the pass leaves
    let blockedAt = Number.NaN;
    let maxZ = 0;
    for (let i = 0; i < 120 && w.ball.owner !== 1; i++) {
      stepWorld(w, [cmd()], t);
      maxZ = Math.max(maxZ, w.ball.z - R);
      if (w.lastCushionPlayer === 1 && w.lastCushionTick === w.tick - 1) blockedAt = w.ball.z - R;
    }
    expect(w.ball.owner).toBe(1);
    expect(blockedAt).toBeGreaterThan(0.3);
    expect(blockedAt).toBeLessThan(1);
    expect(maxZ).toBeLessThan(1.4);
  });

  it('... and with a tap of TIR when the button flashes it is struck in the air, at its height (no lowering it first)', () => {
    const t = tuningWith((x) => {
      exact(x);
      x.pass.errorBase = x.pass.errorSprint = x.pass.errorPressure = x.pass.errorOffBalance = x.pass.errorPower = 0;
      x.mates.move = 0;
    });
    const w = drivenPass(t, 12);
    for (let i = 0; i < 120 && w.lastShotTick < 0; i++) {
      const tap = w.volley.good && w.ball.owner < 0;
      stepWorld(w, [cmd({ moveX: 1, shoot: tap, shootHeld: false })], t);
    }
    expect(w.lastShot.aerial).toBe(true);
    expect(w.lastShot.contactHeight).toBeGreaterThan(0.3);
    expect(Math.abs(w.lastShot.timing)).toBeLessThanOrEqual(V.good + 1e-9);
    // It leaves from where it was struck, in the air.
    expect(w.ball.z - R).toBeGreaterThan(0.25);
  });
});
