import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import { TUNING_PARAMS } from '../../src/config/tuningMeta';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands';
import { createWorld, stepWorld } from '../../src/sim/world';
import { FixedStepLoop } from '../../src/game/fixedStepLoop';
import { gameSeconds, MAX_GAME_SPEED, MIN_GAME_SPEED } from '../../src/game/gameSpeed';

/** Sim ticks that run during `seconds` of real time at 60 fps frames and game speed `speed`. */
function ticksIn(seconds: number, speed: number): number {
  const loop = new FixedStepLoop(TUNING.sim.tickRate, TUNING.sim.maxStepsPerFrame);
  let ticks = 0;
  for (let f = 0; f < seconds * 60; f++) loop.advance(gameSeconds(1 / 60, speed), () => ticks++);
  return ticks;
}

describe('game speed (v0.1.21)', () => {
  it('is a panel setting, 80-140 %, 100 % by default', () => {
    const meta = TUNING_PARAMS.find((p) => p.path === 'game.speed')!;
    expect(meta).toBeDefined();
    expect(meta.min).toBe(80);
    expect(meta.max).toBe(140);
    expect(TUNING.game.speed).toBe(1);
  });

  it('game time runs at that speed against real time, and absurd values are clamped', () => {
    expect(gameSeconds(1, 1.25)).toBeCloseTo(1.25);
    expect(gameSeconds(1, 0.8)).toBeCloseTo(0.8);
    expect(gameSeconds(1, 99)).toBe(MAX_GAME_SPEED);
    expect(gameSeconds(1, 0)).toBe(MIN_GAME_SPEED);
    expect(gameSeconds(1, Number.NaN)).toBe(1);
  });

  it('runs proportionally more or fewer fixed ticks per real second', () => {
    expect(Math.abs(ticksIn(10, 1) - 600)).toBeLessThanOrEqual(1);
    expect(Math.abs(ticksIn(10, 1.4) - 840)).toBeLessThanOrEqual(2);
    expect(Math.abs(ticksIn(10, 0.8) - 480)).toBeLessThanOrEqual(2);
  });

  it('does not touch the determinism: the same inputs give the same world after the same ticks, at any speed', () => {
    const run = (speed: number, frameMs: number): number[] => {
      const w = createWorld(7, 2);
      const c: PlayerCommand = { ...emptyCommand(), moveX: 1, moveY: 0.3, sprint: true };
      const loop = new FixedStepLoop(TUNING.sim.tickRate, TUNING.sim.maxStepsPerFrame);
      while (w.tick < 600) loop.advance(gameSeconds(frameMs / 1000, speed), () => (w.tick < 600 ? stepWorld(w, [c], TUNING) : undefined));
      return [w.tick, w.players[0]!.x, w.players[0]!.y, w.ball.x, w.ball.y, w.players[1]!.x, w.players[2]!.y];
    };
    const a = run(1, 1000 / 60);
    expect(run(1.4, 1000 / 60)).toEqual(a);
    expect(run(0.8, 1000 / 30)).toEqual(a);
    expect(run(1.25, 1000 / 144)).toEqual(a);
  });
});
