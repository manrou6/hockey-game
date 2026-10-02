import type { Tuning } from '../config/tuning';
import type { PlayerCommand } from './commands';
import { createRng, type RngState } from './rng';

export interface PlayerState {
  id: number;
  /** Position on the rink plane (m). Origin = centre spot, x along length, y along width. */
  x: number;
  y: number;
  /** Velocity (m/s). */
  vx: number;
  vy: number;
  /** Facing angle (rad, 0 = +x). */
  heading: number;
  /** Previous-tick pose, used by the renderer to interpolate between ticks. */
  prevX: number;
  prevY: number;
  prevHeading: number;
}

export interface WorldState {
  tick: number;
  rng: RngState;
  players: PlayerState[];
}

export function createPlayer(id: number, x: number, y: number, heading = 0): PlayerState {
  return { id, x, y, vx: 0, vy: 0, heading, prevX: x, prevY: y, prevHeading: heading };
}

export function createWorld(seed: number): WorldState {
  return { tick: 0, rng: createRng(seed), players: [createPlayer(0, 0, 0)] };
}

/** Advance the world exactly one fixed tick. `commands[i]` drives `players[i]`. */
export function stepWorld(world: WorldState, commands: readonly PlayerCommand[], tuning: Tuning): void {
  const dt = 1 / tuning.sim.tickRate;
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i]!;
    p.prevX = p.x;
    p.prevY = p.y;
    p.prevHeading = p.heading;
    const cmd = commands[i];
    if (cmd) {
      // Placeholder kinematics (replaced by skating physics in F0.5).
      p.vx = cmd.moveX * 5;
      p.vy = cmd.moveY * 5;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  world.tick++;
}
