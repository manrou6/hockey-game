import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import type { PlayerCommand } from '../../src/sim/commands';
import { createRng, nextFloat } from '../../src/sim/rng';
import { createWorld, stepWorld, type WorldState } from '../../src/sim/world';

/** Scripted "random" inputs generated from their own seed, so the run is reproducible. */
function scriptedInputs(seed: number, ticks: number): PlayerCommand[] {
  const r = createRng(seed);
  const out: PlayerCommand[] = [];
  let cmd: PlayerCommand = { moveX: 0, moveY: 0, sprint: false };
  for (let i = 0; i < ticks; i++) {
    if (i % 20 === 0) {
      const a = nextFloat(r) * Math.PI * 2;
      const m = nextFloat(r);
      cmd = { moveX: Math.cos(a) * m, moveY: Math.sin(a) * m, sprint: nextFloat(r) > 0.6 };
    }
    out.push(cmd);
  }
  return out;
}

function run(seed: number, inputs: PlayerCommand[]): WorldState {
  const world = createWorld(seed);
  for (const cmd of inputs) stepWorld(world, [cmd], TUNING);
  return world;
}

describe('simulation determinism', () => {
  it('same seed + same inputs → identical state', () => {
    const inputs = scriptedInputs(99, 60 * 30);
    const a = run(5, inputs);
    const b = run(5, inputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.tick).toBe(60 * 30);
  });
});
