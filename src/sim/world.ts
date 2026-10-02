import type { Tuning } from '../config/tuning';
import type { PlayerCommand } from './commands';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from './player';
import { resolveStatic } from './rink';
import { createRng, type RngState } from './rng';

export type { PlayerState } from './player';
export { createPlayer } from './player';

export interface WorldState {
  tick: number;
  rng: RngState;
  players: PlayerState[];
}

const IDLE: PlayerCommand = { moveX: 0, moveY: 0, sprint: false };

export function createWorld(seed: number): WorldState {
  return { tick: 0, rng: createRng(seed), players: [createPlayer(0, -4, 0, 0)] };
}

/** Advance the world exactly one fixed tick. `commands[i]` drives `players[i]`. */
export function stepWorld(world: WorldState, commands: readonly PlayerCommand[], tuning: Tuning): void {
  const dt = 1 / tuning.sim.tickRate;
  const players = world.players;
  for (let i = 0; i < players.length; i++) stepPlayer(players[i]!, commands[i] ?? IDLE, tuning, dt);
  if (players.length > 1) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) collidePlayers(players[i]!, players[j]!, tuning);
    }
    // Player pushes may shove someone into the boards: keep everyone inside.
    const k = tuning.skating;
    for (const p of players) resolveStatic(p, k.radius, k.wallRestitution, k.wallFriction);
  }
  world.tick++;
}
