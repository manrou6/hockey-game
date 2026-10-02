import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createRng, nextFloat } from '../../src/sim/rng';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

function tuningWith(mates: Partial<Tuning['mates']>): Tuning {
  const t = structuredClone(TUNING);
  Object.assign(t.mates, mates);
  return t;
}

function cmd(moveX = 0, moveY = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand {
  return { ...emptyCommand(), moveX, moveY, ...extra };
}

function step(w: WorldState, c: PlayerCommand, tuning: Tuning, ticks = 1): void {
  for (let i = 0; i < ticks; i++) stepWorld(w, [c], tuning);
}

/** Skate onto the ball in front of player 0 and stop with it. */
function takeBall(w: WorldState, tuning: Tuning): void {
  for (let i = 0; i < 120 && w.ball.owner !== 0; i++) step(w, cmd(0.5, 0), tuning);
  expect(w.ball.owner).toBe(0);
  step(w, cmd(), tuning, 60);
  expect(w.ball.owner).toBe(0);
}

/** Pass from the ball towards player `to` (provisional pass: joystick direction). */
function passTo(w: WorldState, to: number, tuning: Tuning, hold = false): PlayerCommand {
  const t = w.players[to]!;
  const a = Math.atan2(t.y - w.ball.y, t.x - w.ball.x);
  const aim = cmd(Math.cos(a), Math.sin(a));
  step(w, { ...aim, pass: true }, tuning);
  return hold ? aim : cmd();
}

function runUntil(w: WorldState, c: PlayerCommand, tuning: Tuning, done: () => boolean, maxTicks = 600): number {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return i;
    step(w, c, tuning);
  }
  return -1;
}

describe('teammates test bench (F1.4a)', () => {
  it('creates the human player plus two teammates; the human controls player 0', () => {
    const w = createWorld(1, 2);
    expect(w.players).toHaveLength(3);
    expect(w.controlled).toBe(0);
    expect(w.players.every((p) => p.team === 0 && p.bot)).toBe(true);
    // Without teammates the world is the same single player as before.
    expect(createWorld(1).players).toHaveLength(1);
  });

  it('control switches to the receiver as soon as the pass leaves, and he takes the ball', () => {
    const tuning = tuningWith({ move: 0 });
    const w = createWorld(3, 2);
    takeBall(w, tuning);
    passTo(w, 1, tuning);
    expect(w.ball.owner).toBe(-1);
    expect(w.controlled).toBe(1);
    // With the stick released he goes to meet the ball and receives it.
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 240)).toBeGreaterThanOrEqual(0);
    expect(w.controlled).toBe(1);
  });

  it('the stick held from the pass does not drive the new player until released or turned', () => {
    const tuning = tuningWith({ move: 0 });
    const w = createWorld(3, 2);
    takeBall(w, tuning);
    const aim = passTo(w, 2, tuning, true);
    expect(w.controlled).toBe(2);
    expect(Number.isNaN(w.latchDir)).toBe(false);
    // Still holding the pass direction (towards the receiver, i.e. away from the ball):
    // he goes to the ball anyway.
    expect(runUntil(w, aim, tuning, () => w.ball.owner === 2, 240)).toBeGreaterThanOrEqual(0);
    // Turning the stick well away from the old direction gives the human the control.
    step(w, cmd(-aim.moveY, aim.moveX), tuning);
    expect(Number.isNaN(w.latchDir)).toBe(true);
  });

  it('with the switch off you keep your player and the teammate gives the ball back', () => {
    const tuning = tuningWith({ move: 0, switchControl: 0 });
    const w = createWorld(4, 2);
    takeBall(w, tuning);
    passTo(w, 1, tuning);
    expect(w.controlled).toBe(0);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 240)).toBeGreaterThanOrEqual(0);
    // He keeps it about returnDelay, then passes back; we receive with the stick released.
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner !== 1, 120)).toBeGreaterThanOrEqual(Math.round(tuning.mates.returnDelay * 60) - 2);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 0, 300)).toBeGreaterThanOrEqual(0);
    expect(w.controlled).toBe(0);
  });

  it('provisional aim (until F1.4b): a pass roughly towards a teammate goes to his stick', () => {
    const tuning = tuningWith({ move: 0 });
    const w = createWorld(9, 2);
    takeBall(w, tuning);
    const t = w.players[1]!;
    // 20° off the line to him.
    const a = Math.atan2(t.y - w.ball.y, t.x - w.ball.x) - 0.35;
    step(w, cmd(Math.cos(a), Math.sin(a), { pass: true }), tuning);
    expect(w.controlled).toBe(1);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 240)).toBeGreaterThanOrEqual(0);
  });

  it('a shot never switches the control', () => {
    const tuning = tuningWith({ move: 0 });
    const w = createWorld(5, 2);
    takeBall(w, tuning);
    step(w, cmd(0, 1, { shoot: true }), tuning);
    expect(w.ball.owner).toBe(-1);
    expect(w.controlled).toBe(0);
  });

  it('teammates offer a passing line beside and ahead of the carrier, or stand still', () => {
    const tuning = tuningWith({ switchControl: 0 });
    const w = createWorld(6, 2);
    takeBall(w, tuning);
    // Carry the ball up the rink, then stop and let them arrive.
    step(w, cmd(1, 0), tuning, 60);
    step(w, cmd(), tuning, 240);
    const c = w.players[0]!;
    const m = tuning.mates;
    const spots = w.players.slice(1).map((p) => ({ dx: p.x - c.x, dy: p.y - c.y }));
    for (const s of spots) {
      expect(Math.abs(s.dx - m.supportAhead)).toBeLessThan(1);
      expect(Math.abs(Math.abs(s.dy) - m.supportSide)).toBeLessThan(1);
    }
    expect(Math.sign(spots[0]!.dy)).not.toBe(Math.sign(spots[1]!.dy));

    // Near a side board both spots slide across together: they never pile up on one spot.
    const w3 = createWorld(6, 2);
    takeBall(w3, tuning);
    step(w3, cmd(0, 1), tuning, 90);
    step(w3, cmd(), tuning, 300);
    const [a, b] = w3.players.slice(1);
    expect(w3.players[0]!.y).toBeGreaterThan(6);
    expect(Math.abs(a!.y - b!.y)).toBeGreaterThan(2 * m.supportSide - 1);

    const still = tuningWith({ move: 0, switchControl: 0 });
    const w2 = createWorld(6, 2);
    const before = w2.players.slice(1).map((p) => [p.x, p.y]);
    takeBall(w2, still);
    step(w2, cmd(1, 0), still, 90);
    expect(w2.players.slice(1).map((p) => [p.x, p.y])).toEqual(before);
  });

  it('a teammate picks up a slow loose ball near him, and then the human controls him', () => {
    const w = createWorld(7, 2);
    const mate = w.players[1]!;
    w.ball.x = w.ball.prevX = mate.x + 2;
    w.ball.y = w.ball.prevY = mate.y;
    expect(runUntil(w, cmd(), TUNING, () => w.ball.owner === 1, 240)).toBeGreaterThanOrEqual(0);
    expect(w.controlled).toBe(1);
  });

  it('the new controlled player dribbles, does the trencada and the skid like the first one', () => {
    const tuning = tuningWith({ move: 0 });
    const w = createWorld(8, 2);
    takeBall(w, tuning);
    passTo(w, 1, tuning);
    expect(runUntil(w, cmd(), tuning, () => w.ball.owner === 1, 240)).toBeGreaterThanOrEqual(0);
    const p = w.players[1]!;
    // Dribble at full normal speed along +x: the ball stays on the stick.
    step(w, cmd(1, 0), tuning, 90);
    expect(w.ball.owner).toBe(1);
    expect(Math.hypot(p.vx, p.vy)).toBeGreaterThan(tuning.skating.maxSpeed * 0.9);
    // Flick the stick 90°: trencada.
    step(w, cmd(0, -1), tuning);
    expect(p.cutPrep > 0 || p.cutTime > 0).toBe(true);
    step(w, cmd(0, -1), tuning, 40);
    // Back up to speed along the rink, then reverse the stick: four-wheel skid stop.
    step(w, cmd(-1, 0), tuning, 75);
    expect(Math.hypot(p.vx, p.vy)).toBeGreaterThan(tuning.skating.pivotSpeed + 1);
    step(w, cmd(1, 0), tuning);
    expect(p.skidTime).toBeGreaterThan(0);
  });

  it('is deterministic with teammates, passes and control switches', () => {
    const run = (): string => {
      const w = createWorld(11, 2);
      const r = createRng(42);
      let c = cmd();
      for (let i = 0; i < 60 * 40; i++) {
        if (i % 25 === 0) {
          const a = nextFloat(r) * Math.PI * 2;
          c = cmd(Math.cos(a), Math.sin(a), { sprint: nextFloat(r) > 0.7, pass: nextFloat(r) > 0.6 });
        } else c = { ...c, pass: false };
        stepWorld(w, [c], TUNING);
      }
      return JSON.stringify(w);
    };
    const a = run();
    expect(run()).toBe(a);
  });
});
