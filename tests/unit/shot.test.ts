import { describe, expect, it } from 'vitest';
import { goalLineX, RINK } from '../../src/config/rink';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { createBall } from '../../src/sim/ball';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createPlayer } from '../../src/sim/player';
import {
  createShotPlan,
  heightAt,
  planShot,
  SHOT_CHIP,
  SHOT_HIGH,
  SHOT_LOW,
  shotErrorSd,
  shotKindFromHeight,
  shotPower,
  updateShotButton,
} from '../../src/sim/shot';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

// F1.5a: the shot (docs/03 §3 TIRO).

const DT = 1 / 60;
const GX = goalLineX(1);
const HALF = RINK.goalWidth / 2 - TUNING.shot.postMargin;

function tuningWith(patch: (t: Tuning) => void): Tuning {
  const t = structuredClone(TUNING);
  patch(t);
  return t;
}

/** No random error at all: to check the geometry exactly. */
const exact = (t: Tuning): void => {
  t.shot.errorBase = t.shot.errorSprint = t.shot.errorOffBalance = t.shot.errorTurn = 0;
  t.shot.errorPower = 0;
};

const cmd = (moveX = 0, moveY = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), moveX, moveY, ...extra });
const deg = (d: number): number => (d * Math.PI) / 180;
const dir = (a: number, extra: Partial<PlayerCommand> = {}): PlayerCommand => cmd(Math.cos(a), Math.sin(a), extra);

describe('TIRO button (carrying the ball)', () => {
  const k = TUNING.shot;
  const hold = (seconds: number, height = 0, hasBall = true): ReturnType<typeof createPlayer> => {
    const p = createPlayer(0, 0, 0);
    updateShotButton(p, cmd(0, 0, { shoot: true, shootHeld: seconds > 0, shootHeight: height }), TUNING, DT, hasBall);
    for (let i = 0; i < Math.round(seconds / DT) - 1; i++) updateShotButton(p, cmd(0, 0, { shootHeld: true, shootHeight: height }), TUNING, DT, hasBall);
    if (seconds > 0) updateShotButton(p, cmd(0, 0, { shootHeight: height }), TUNING, DT, hasBall);
    return p;
  };
  it('a tap is a quick shot, queued at once with the height of the gesture', () => {
    const p = hold(0, 1);
    expect(p.bufShoot).toBe(1);
    expect(p.shotQuick).toBe(true);
    expect(p.shotKind).toBe(SHOT_HIGH);
    expect(p.shotHold).toBe(-1);
  });
  it('holding charges the power from 0 to 1 over chargeTime; it leaves on release', () => {
    const half = hold(k.tapTime + k.chargeTime / 2, 0);
    expect(half.shotQuick).toBe(false);
    expect(half.shotCharge).toBeCloseTo(0.5, 1);
    expect(hold(k.tapTime + k.chargeTime * 2, 2).shotCharge).toBe(1);
    expect(hold(k.tapTime + k.chargeTime * 2, 2).shotKind).toBe(SHOT_CHIP);
    expect(shotPower(k.tapTime / 2, k)).toBe(0);
  });
  it('without the ball the release waits in the input buffer (first touch, F1.5b); pressed with the ball, losing it cancels the charge; not while PASE is held', () => {
    const buffered = hold(0.15, 0, false);
    expect(buffered.bufShoot).toBe(Math.round(TUNING.input.bufferTime * 60));
    expect(buffered.shotWithBall).toBe(false);
    const p = createPlayer(0, 0, 0);
    updateShotButton(p, cmd(0, 0, { shoot: true, shootHeld: true }), TUNING, DT, true);
    expect(p.shotHold).toBe(0);
    updateShotButton(p, cmd(0, 0, { shootHeld: true }), TUNING, DT, false);
    expect(p.shotHold).toBe(-1);
    updateShotButton(p, cmd(), TUNING, DT, false);
    expect(p.bufShoot).toBe(0);
    const q = createPlayer(0, 0, 0);
    q.passHold = 0.1;
    updateShotButton(q, cmd(0, 0, { shoot: true, shootHeld: true }), TUNING, DT, true);
    expect(q.shotHold).toBe(-1);
  });
  it('height from the command: 0 low, 1 high, 2 chip', () => {
    expect(shotKindFromHeight(0)).toBe(SHOT_LOW);
    expect(shotKindFromHeight(1)).toBe(SHOT_HIGH);
    expect(shotKindFromHeight(2)).toBe(SHOT_CHIP);
  });
});

describe('where the shot goes (option A: the stick angle from the centre of the goal, magnified)', () => {
  const ball = createBall(GX - 8, 0);
  const p = createPlayer(0, GX - 8.5, 0);
  const range = TUNING.shot.mediumAimRange;
  const plan = (c: PlayerCommand, level: 'off' | 'light' | 'medium' | 'strong' = 'medium', y = 0): ReturnType<typeof createShotPlan> => {
    ball.y = y;
    p.y = y;
    return planShot(p, ball, c, level, SHOT_LOW, 0, true, TUNING, createShotPlan());
  };
  it('at the centre of the goal: the centre; the aim range to one side: that post (inside postMargin); beyond: still the post', () => {
    expect(plan(dir(0)).targetY).toBeCloseTo(0, 6);
    expect(plan(dir(range)).targetY).toBeCloseTo(HALF, 6);
    expect(plan(dir(-range)).targetY).toBeCloseTo(-HALF, 6);
    expect(plan(dir(range / 2)).targetY).toBeCloseTo(HALF / 2, 6);
    expect(plan(dir(range * 1.8)).targetY).toBeCloseTo(HALF, 6);
    expect(plan(dir(0)).aimed).toBe(true);
  });
  it('moving towards the centre from the side, a small tilt of the thumb picks the near post', () => {
    // From y = 4 the direction to the centre is about −27°; tilting 15° more towards +y aims at the near (+y) post side.
    const toCentre = Math.atan2(-4, 8);
    const near = plan(dir(toCentre + deg(15)), 'medium', 4);
    expect(near.targetY).toBeGreaterThan(HALF * 0.5);
    const far = plan(dir(toCentre - deg(15)), 'medium', 4);
    expect(far.targetY).toBeLessThan(-HALF * 0.5);
  });
  it('the stick released: the far post', () => {
    expect(plan(cmd(), 'medium', 3).targetY).toBeCloseTo(-HALF * TUNING.shot.farPost, 6);
    expect(plan(cmd(), 'medium', -3).targetY).toBeCloseTo(HALF * TUNING.shot.farPost, 6);
  });
  it('a smaller aim range (Lleugera) is more sensitive, a bigger one (Forta) less', () => {
    const a = deg(15);
    expect(plan(dir(a), 'light').targetY).toBeGreaterThan(plan(dir(a), 'medium').targetY);
    expect(plan(dir(a), 'strong').targetY).toBeLessThan(plan(dir(a), 'medium').targetY);
  });
  it('the stick pointing away from the goal (more than aimMaxOff): it goes where the stick points', () => {
    const away = plan(dir(deg(120)));
    expect(away.angle).toBeCloseTo(deg(120), 6);
    expect(away.aimed).toBe(false);
  });
  it('assist off: exactly where the stick points (the reticle where that line meets the goal line)', () => {
    const off = plan(dir(deg(3)), 'off');
    expect(off.angle).toBeCloseTo(deg(3), 6);
    expect(off.targetY).toBeCloseTo(Math.tan(deg(3)) * 8, 4);
  });
  it('the other team attacks the other goal (signs mirrored)', () => {
    const q = createPlayer(1, -GX + 8.5, 0);
    q.team = 1;
    const b = createBall(-GX + 8, 0);
    const pl = planShot(q, b, dir(Math.PI - range), 'medium', SHOT_LOW, 0, true, TUNING, createShotPlan());
    expect(pl.targetX).toBeCloseTo(-GX, 6);
    // Rotating clockwise from −x (towards +y) aims at the +y post when shooting towards −x.
    expect(pl.targetY).toBeCloseTo(HALF, 6);
  });
});

describe('speed and height', () => {
  const ball = createBall(GX - 10, 0);
  const p = createPlayer(0, GX - 10.5, 0);
  const k = TUNING.shot;
  it('quick shot at quickSpeed; charged from minSpeed (start) to maxSpeed (full: the strong shot)', () => {
    expect(planShot(p, ball, dir(0), 'medium', SHOT_LOW, 0, true, TUNING, createShotPlan()).speed).toBe(k.quickSpeed);
    expect(planShot(p, ball, dir(0), 'medium', SHOT_LOW, 0, false, TUNING, createShotPlan()).speed).toBe(k.minSpeed);
    expect(planShot(p, ball, dir(0), 'medium', SHOT_LOW, 1, false, TUNING, createShotPlan()).speed).toBe(k.maxSpeed);
  });
  it('low on the floor; high crosses the goal line at highHeight; chip arcs over and comes down under the bar', () => {
    const low = planShot(p, ball, dir(0), 'medium', SHOT_LOW, 0.5, false, TUNING, createShotPlan());
    expect(low.elevation).toBe(0);
    const high = planShot(p, ball, dir(0), 'medium', SHOT_HIGH, 0.5, false, TUNING, createShotPlan());
    expect(high.elevation).toBeGreaterThan(0);
    expect(heightAt(high.speed, high.elevation, 10, TUNING.ball)).toBeCloseTo(k.highHeight, 2);
    const chip = planShot(p, ball, dir(0), 'medium', SHOT_CHIP, 0, true, TUNING, createShotPlan());
    expect(chip.elevation).toBeCloseTo(k.chipAngle, 6);
    expect(chip.targetZ).toBeGreaterThan(0.2);
    expect(chip.targetZ).toBeLessThan(RINK.goalHeight - RINK.ballRadius);
    expect(chip.speed).toBeLessThan(high.speed);
  });
});

describe('error', () => {
  const p = createPlayer(0, 0, 0);
  const plan = createShotPlan();
  plan.angle = 0;
  it('charging makes it more precise; sprinting, turning away and less assist make it less; the Tir attribute reduces it', () => {
    const quick = shotErrorSd(p, plan, true, 0, 'medium', TUNING);
    expect(shotErrorSd(p, plan, false, 1, 'medium', TUNING)).toBeCloseTo(quick * (1 - TUNING.shot.chargePrecision), 6);
    expect(shotErrorSd(p, plan, true, 0, 'strong', TUNING)).toBeLessThan(quick);
    expect(shotErrorSd(p, plan, true, 0, 'light', TUNING)).toBeGreaterThan(quick);
    const sprinter = createPlayer(0, 0, 0);
    sprinter.vx = TUNING.skating.sprintSpeed;
    expect(shotErrorSd(sprinter, plan, true, 0, 'medium', TUNING)).toBeGreaterThan(quick);
    const turned = createShotPlan();
    turned.angle = deg(120);
    expect(shotErrorSd(p, turned, true, 0, 'medium', TUNING)).toBeGreaterThan(quick);
    const star = createPlayer(0, 0, 0);
    star.shooting = 99;
    expect(shotErrorSd(star, plan, true, 0, 'medium', TUNING)).toBeLessThan(quick);
  });
});

/** A world with the human's player carrying the ball `dist` m in front of the +x goal. */
function shooterWorld(tuning: Tuning, dist: number, y = 0): WorldState {
  const w = createWorld(3, 0);
  for (let i = 0; i < 120 && w.ball.owner !== 0; i++) stepWorld(w, [cmd(0.5, 0)], tuning);
  for (let i = 0; i < 30; i++) stepWorld(w, [cmd()], tuning);
  expect(w.ball.owner).toBe(0);
  const p = w.players[0]!;
  p.x = p.prevX = GX - dist - 0.55;
  p.y = p.prevY = y;
  p.vx = p.vy = 0;
  p.heading = 0;
  w.ball.x = w.ball.prevX = GX - dist;
  w.ball.y = w.ball.prevY = y - 0.14;
  return w;
}

/** Run until the ball crosses the goal line (or stops): its y and z there. */
function crossing(w: WorldState, tuning: Tuning, maxTicks = 180): { y: number; z: number } | null {
  for (let i = 0; i < maxTicks; i++) {
    const px = w.ball.x;
    const py = w.ball.y;
    const pz = w.ball.z;
    stepWorld(w, [cmd()], tuning);
    if (px < GX && w.ball.x >= GX) {
      const u = (GX - px) / (w.ball.x - px);
      return { y: py + (w.ball.y - py) * u, z: pz + (w.ball.z - pz) * u };
    }
  }
  return null;
}

describe('in the world', () => {
  it('a quick low shot leaves on the tick TIRO is released and goes in where aimed', () => {
    const t = tuningWith(exact);
    const w = shooterWorld(t, 7);
    stepWorld(w, [dir(0, { shoot: true, shootHeld: true })], t);
    expect(w.ball.owner).toBe(0); // still on the stick while the button is down
    stepWorld(w, [dir(0)], t);
    expect(w.ball.owner).toBe(-1);
    expect(w.lastShotTick).toBe(w.tick - 1);
    expect(w.lastShot.speed).toBeCloseTo(t.shot.quickSpeed, 6);
    const c = crossing(w, t);
    expect(c).not.toBeNull();
    expect(Math.abs(c!.y)).toBeLessThan(0.15);
    expect(c!.z).toBeLessThan(0.2);
  });
  it('a high shot crosses the goal line at about highHeight, a chip under the bar', () => {
    const t = tuningWith(exact);
    const w = shooterWorld(t, 9);
    stepWorld(w, [dir(0, { shoot: true, shootHeld: true, shootHeight: 1 })], t);
    stepWorld(w, [dir(0, { shootHeight: 1 })], t);
    const c = crossing(w, t);
    expect(c!.z).toBeGreaterThan(t.shot.highHeight - 0.15);
    expect(c!.z).toBeLessThan(t.shot.highHeight + 0.15);
    const w2 = shooterWorld(t, 9);
    stepWorld(w2, [dir(0, { shoot: true, shootHeld: true, shootHeight: 2 })], t);
    stepWorld(w2, [dir(0, { shootHeight: 2 })], t);
    const c2 = crossing(w2, t);
    expect(c2!.z).toBeGreaterThan(0.2);
    expect(c2!.z).toBeLessThan(RINK.goalHeight);
  });
  it('charging: the ball stays glued to the blade, he skates slower (no sprint), and the full charge is the strong shot', () => {
    const t = tuningWith(exact);
    const w = shooterWorld(t, 16);
    const p = w.players[0]!;
    stepWorld(w, [dir(0, { shoot: true, shootHeld: true, sprint: true })], t);
    let maxSpeed = 0;
    for (let i = 0; i < 60; i++) {
      stepWorld(w, [dir(0, { shootHeld: true, sprint: true })], t);
      maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vy));
      expect(w.ball.owner).toBe(0);
      expect(w.ball.separation).toBeLessThan(0.05);
    }
    expect(maxSpeed).toBeLessThanOrEqual(t.skating.maxSpeed * t.shot.chargeSpeedFactor + 1e-6);
    stepWorld(w, [dir(0)], t);
    expect(w.lastShot.speed).toBeCloseTo(t.shot.maxSpeed, 6);
  });
  it('PASE is ignored while charging a shot', () => {
    const t = tuningWith(exact);
    const w = shooterWorld(t, 10);
    stepWorld(w, [dir(0, { shoot: true, shootHeld: true })], t);
    stepWorld(w, [dir(0, { shootHeld: true, pass: true, passHeld: true })], t);
    expect(w.players[0]!.passHold).toBe(-1);
  });
  it('the reticle: shown near the goal (low until TIRO picks a height), hidden far away unless charging', () => {
    const t = tuningWith(exact);
    const near = shooterWorld(t, 10);
    stepWorld(near, [dir(0)], t);
    expect(near.shotAimActive).toBe(true);
    expect(near.shotAim.kind).toBe(SHOT_LOW);
    stepWorld(near, [dir(0, { shoot: true, shootHeld: true, shootHeight: 1 })], t);
    expect(near.shotAim.kind).toBe(SHOT_HIGH);
    const far = shooterWorld(t, t.shot.reticleRange + 5);
    stepWorld(far, [dir(0)], t);
    expect(far.shotAimActive).toBe(false);
    stepWorld(far, [dir(0, { shoot: true, shootHeld: true })], t);
    expect(far.shotAimActive).toBe(true);
  });
  it('is deterministic (same seed, same shot, error included)', () => {
    const run = (): number[] => {
      const w = shooterWorld(TUNING, 12, 2);
      stepWorld(w, [dir(deg(-10), { shoot: true, shootHeld: true })], TUNING);
      for (let i = 0; i < 20; i++) stepWorld(w, [dir(deg(-10), { shootHeld: true })], TUNING);
      stepWorld(w, [dir(deg(-10))], TUNING);
      for (let i = 0; i < 40; i++) stepWorld(w, [cmd()], TUNING);
      return [w.ball.x, w.ball.y, w.ball.z, w.lastShot.angle, w.lastShot.speed];
    };
    expect(run()).toEqual(run());
  });
});

// --- F1.5b: first-touch shot and turn shot ------------------------------------------------

/** A ground pass rolling to the blade of the (still) player 7 m in front of the goal, from `gap` m away at his side. */
function passToShooter(tuning: Tuning, speed = 14, gap = 6): WorldState {
  const w = createWorld(5, 0);
  const p = w.players[0]!;
  p.x = p.prevX = GX - 7.5;
  p.y = p.prevY = 0;
  p.heading = p.prevHeading = Math.PI / 2; // facing +y, where the pass comes from
  const bladeX = p.x + 0.55 * Math.cos(p.heading) + 0.14 * Math.sin(p.heading);
  const bladeY = p.y + 0.55 * Math.sin(p.heading) - 0.14 * Math.cos(p.heading);
  w.ball.owner = -1;
  w.ball.x = w.ball.prevX = bladeX;
  w.ball.y = w.ball.prevY = bladeY + gap;
  w.ball.vx = 0;
  w.ball.vy = -speed;
  w.passTo = 0;
  w.meetX = bladeX;
  w.meetY = bladeY;
  void tuning;
  return w;
}

describe('first-touch shot (F1.5b)', () => {
  it('TIRO released just before the ball arrives: the shot leaves on the tick he gets it', () => {
    const t = tuningWith(exact);
    const w = passToShooter(t, 14, 2); // ~0.15 s away: inside the input buffer
    stepWorld(w, [cmd(0, 0, { shoot: true, shootHeld: true })], t);
    stepWorld(w, [cmd(0, 0)], t); // released without the ball: waits in the buffer
    expect(w.players[0]!.bufShoot).toBeGreaterThan(0);
    for (let i = 0; i < 60 && w.lastShotTick < 0; i++) stepWorld(w, [dir(0)], t);
    expect(w.lastShotTick).toBeGreaterThan(0);
    expect(w.lastShotTick).toBe(w.lastReceptionTick);
    expect(w.lastShot.firstTouch).toBe(true);
  });
  it('released too early (before the input buffer), nothing happens when he gets it', () => {
    const t = tuningWith(exact);
    const w = passToShooter(t, 6);
    stepWorld(w, [cmd(0, 0, { shoot: true, shootHeld: true })], t);
    stepWorld(w, [cmd(0, 0)], t);
    for (let i = 0; i < 90 && w.ball.owner !== 0; i++) stepWorld(w, [cmd()], t);
    expect(w.ball.owner).toBe(0);
    expect(w.lastShotTick).toBeLessThan(0);
  });
  it('TIRO right after getting it (within the first-touch window) is a first-touch shot; later it is not', () => {
    const t = tuningWith(exact);
    const w = passToShooter(t);
    for (let i = 0; i < 90 && w.ball.owner !== 0; i++) stepWorld(w, [cmd()], t);
    expect(w.ball.owner).toBe(0);
    stepWorld(w, [dir(0, { shoot: true })], t);
    expect(w.lastShot.firstTouch).toBe(true);
    const w2 = passToShooter(t);
    for (let i = 0; i < 90 && w2.ball.owner !== 0; i++) stepWorld(w2, [cmd()], t);
    for (let i = 0; i < Math.round(t.receive.firstTouchWindow * 60) + 2; i++) stepWorld(w2, [cmd()], t);
    stepWorld(w2, [dir(0, { shoot: true })], t);
    expect(w2.lastShot.firstTouch).toBe(false);
  });
  it('its error: × firstTouchError × (1 + how hard the reception was), plus the redirection of the ball beyond redirectFree', () => {
    const p = createPlayer(0, 0, 0);
    const plan = createShotPlan();
    plan.angle = 0;
    const normal = shotErrorSd(p, plan, true, 0, 'medium', TUNING);
    p.firstTouchTicks = 5;
    p.receiveDifficulty = 0;
    p.receivedBallAngle = 0; // the ball was going the way he shoots: no redirection
    expect(shotErrorSd(p, plan, true, 0, 'medium', TUNING)).toBeCloseTo(normal * TUNING.shot.firstTouchError, 9);
    p.receiveDifficulty = 0.3;
    expect(shotErrorSd(p, plan, true, 0, 'medium', TUNING)).toBeCloseTo(normal * TUNING.shot.firstTouchError * 1.3, 9);
    p.receivedBallAngle = Math.PI; // shooting it straight back: redirected 180°
    expect(shotErrorSd(p, plan, true, 0, 'medium', TUNING)).toBeGreaterThan(normal * TUNING.shot.firstTouchError * 1.3 + 1e-6);
  });
});

/** The human's player with the ball `dist` m in front of the +x goal, his back to it. */
function backToGoal(tuning: Tuning, dist: number): WorldState {
  const w = shooterWorld(tuning, dist);
  const p = w.players[0]!;
  p.heading = p.prevHeading = Math.PI;
  p.x = p.prevX = w.ball.x + 0.55;
  p.y = p.prevY = w.ball.y - 0.14;
  w.ball.y = w.ball.prevY = p.y + 0.14;
  w.ball.x = w.ball.prevX = p.x - 0.55;
  return w;
}

describe('turn shot (media vuelta, F1.5b)', () => {
  it('back to the goal and near it, TIRO turns him (the ball stays on the stick) and then shoots at the goal, within 0.35 s of pressing', () => {
    const t = tuningWith(exact);
    const w = backToGoal(t, 5);
    const p = w.players[0]!;
    // A 0.1 s tap with the stick released.
    stepWorld(w, [cmd(0, 0, { shoot: true, shootHeld: true })], t);
    for (let i = 0; i < 4; i++) stepWorld(w, [cmd(0, 0, { shootHeld: true })], t);
    stepWorld(w, [cmd()], t);
    expect(w.lastTurnTick).toBe(w.tick - 1);
    expect(w.lastShotTick).toBeLessThan(0);
    let ticks = 6;
    while (w.lastShotTick < 0 && ticks < 60) {
      expect(w.ball.owner).toBe(0);
      stepWorld(w, [cmd()], t);
      ticks++;
    }
    expect(ticks / 60).toBeLessThanOrEqual(0.35);
    expect(w.lastShot.turned).toBe(true);
    expect(Math.abs(p.heading)).toBeLessThan(0.4); // now facing the goal (+x)
    expect(Math.cos(w.lastShot.angle)).toBeGreaterThan(0.9);
  });
  it('far from the goal (beyond turnRange) there is no turn', () => {
    const t = tuningWith(exact);
    const w = backToGoal(t, t.shot.turnRange + 4);
    stepWorld(w, [cmd(0, 0, { shoot: true })], t);
    expect(w.lastTurnTick).toBeLessThan(0);
    expect(w.lastShotTick).toBe(w.tick - 1);
  });
  it('facing the goal there is no turn either; a turned shot has turnError more error', () => {
    const t = tuningWith(exact);
    const w = shooterWorld(t, 5);
    stepWorld(w, [dir(0, { shoot: true })], t);
    expect(w.lastTurnTick).toBeLessThan(0);
    const p = createPlayer(0, 0, 0);
    const plan = createShotPlan();
    const normal = shotErrorSd(p, plan, true, 0, 'medium', TUNING);
    p.shotTurned = true;
    expect(shotErrorSd(p, plan, true, 0, 'medium', TUNING)).toBeCloseTo(normal * TUNING.shot.turnError, 9);
  });
  it('is deterministic', () => {
    const go = (): number[] => {
      const w = backToGoal(TUNING, 6);
      stepWorld(w, [cmd(0, 0, { shoot: true })], TUNING);
      for (let i = 0; i < 60; i++) stepWorld(w, [cmd()], TUNING);
      return [w.ball.x, w.ball.y, w.lastShot.angle, w.lastShotTick];
    };
    expect(go()).toEqual(go());
  });
});
