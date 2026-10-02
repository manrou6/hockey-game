import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { createBall, placeBall, stepBall, type BallEvent, type BallState } from './ball';
import { emptyCommand, type PlayerCommand } from './commands';
import { bufferActions, canPickUp, pickUp, provisionalActions, stepDribble } from './dribble';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from './player';
import { boardSignedDistance, resolveStatic } from './rink';
import { createRng, type RngState } from './rng';
import { skatingFor } from './feel';

export type { PlayerState } from './player';
export { createPlayer } from './player';

/** Ticks the ball stays in the net after a goal before it is put back (free play). */
const GOAL_RESET_TICKS = 90;

export interface WorldState {
  tick: number;
  rng: RngState;
  players: PlayerState[];
  ball: BallState;
  /** Ball events that happened during the last tick (cleared every tick). */
  events: BallEvent[];
  /** Countdown to put the ball back after a goal (0 = none). */
  ballResetTicks: number;
}

const IDLE: PlayerCommand = emptyCommand();

export function createWorld(seed: number): WorldState {
  return {
    tick: 0,
    rng: createRng(seed),
    players: [createPlayer(0, -4, 0, 0)],
    ball: createBall(-2.5, 0),
    events: [],
    ballResetTicks: 0,
  };
}

const n = { nx: 0, ny: 0 };

/** Free play (no rules yet): an out ball reappears in front of the player; a goal goes back to the centre. */
function freePlayBallRules(world: WorldState): void {
  const ball = world.ball;
  if (ball.out) {
    const p = world.players[0];
    let x = p ? p.x + Math.cos(p.heading) * 1.2 : 0;
    let y = p ? p.y + Math.sin(p.heading) * 1.2 : 0;
    // Keep the drop point well inside the boards.
    const sd = boardSignedDistance(x, y, n);
    if (sd > -1) {
      x -= n.nx * (sd + 1);
      y -= n.ny * (sd + 1);
    }
    placeBall(ball, x, y);
    return;
  }
  if (ball.scored && world.ballResetTicks === 0) world.ballResetTicks = GOAL_RESET_TICKS;
  if (world.ballResetTicks > 0 && --world.ballResetTicks === 0) placeBall(ball, 0, 0);
}

/** Advance the world exactly one fixed tick. `commands[i]` drives `players[i]`. */
export function stepWorld(world: WorldState, commands: readonly PlayerCommand[], tuning: Tuning): void {
  const dt = 1 / tuning.sim.tickRate;
  const players = world.players;
  world.events.length = 0;
  const ball = world.ball;
  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    const cmd = commands[i] ?? IDLE;
    bufferActions(p, cmd, tuning);
    stepPlayer(p, cmd, tuning, dt, ball.owner === i);
  }
  if (players.length > 1) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) collidePlayers(players[i]!, players[j]!, tuning);
    }
    // Player pushes may shove someone into the boards: keep everyone inside.
    for (const p of players) {
      const k = skatingFor(p, tuning);
      resolveStatic(p, k.radius, k.wallRestitution, k.wallFriction);
    }
  }
  // Ball: carried on a stick, or free physics (then maybe someone takes it).
  if (ball.owner >= 0) {
    const owner = players[ball.owner]!;
    if (!provisionalActions(ball, owner, commands[ball.owner] ?? IDLE, tuning)) {
      stepDribble(ball, owner, players, tuning, world.rng, dt);
    }
  }
  if (ball.owner < 0) {
    stepBall(ball, players, tuning, world.rng, dt, world.events);
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      if (canPickUp(ball, p, tuning)) {
        pickUp(ball, i, p);
        // Input buffer: a pass/shot pressed just before receiving fires now.
        provisionalActions(ball, p, commands[i] ?? IDLE, tuning);
        break;
      }
    }
  }
  freePlayBallRules(world);
  world.tick++;
}

/** Ball radius re-exported for the renderer. */
export const BALL_RADIUS = RINK.ballRadius;
