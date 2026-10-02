import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { createBall, placeBall, stepBall, type BallEvent, type BallState } from './ball';
import { emptyCommand, type PlayerCommand } from './commands';
import { bufferActions, canPickUp, pickUp, provisionalActions, stepDribble } from './dribble';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from './player';
import { boardSignedDistance, resolveStatic } from './rink';
import { createRng, type RngState } from './rng';
import { dribbleFor, skatingFor } from './feel';
import { botCommand, findReceiver, interceptMove, type BotContext } from './mates';
import { wrapAngle } from './player';

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
  /** Index of the player the human controls (the human command drives this one). */
  controlled: number;
  /**
   * Right after the control switches to another player, the stick direction the human was
   * holding (rad): it is ignored for the new player until released or turned (NaN = none).
   */
  latchDir: number;
}

const IDLE: PlayerCommand = emptyCommand();

/**
 * A free-play world: the human's player (index 0) with the ball in front, plus `mates`
 * teammates (F1.4 test bench) that move on their own when the human isn't controlling them.
 */
export function createWorld(seed: number, mates = 0): WorldState {
  const players = [createPlayer(0, -4, 0, 0)];
  for (let i = 0; i < mates; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    players.push(createPlayer(i + 1, -1 + Math.floor(i / 2) * 4, side * 5, 0));
  }
  if (mates > 0) for (const p of players) p.bot = true;
  return {
    tick: 0,
    rng: createRng(seed),
    players,
    ball: createBall(-2.5, 0),
    events: [],
    ballResetTicks: 0,
    controlled: 0,
    latchDir: Number.NaN,
  };
}

/** Give the human control of another player (FIFA-like switch, docs/03 §3). */
export function switchControl(world: WorldState, index: number, human: PlayerCommand): void {
  if (index === world.controlled || !world.players[index]) return;
  world.controlled = index;
  // Whatever the stick is holding now was meant for the previous player.
  const m = Math.hypot(human.moveX, human.moveY);
  world.latchDir = m >= 0.01 ? Math.atan2(human.moveY, human.moveX) : Number.NaN;
}

const n = { nx: 0, ny: 0 };

/** Free play (no rules yet): an out ball reappears in front of the player; a goal goes back to the centre. */
function freePlayBallRules(world: WorldState): void {
  const ball = world.ball;
  if (ball.out) {
    const p = world.players[world.controlled];
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

/** Per-player commands actually applied this tick (scratch, reused: no allocation). */
const effective: PlayerCommand[] = [];
const botCtx: BotContext = { players: [], ball: createBall(0, 0), controlled: 0, receiver: -1 };

function copyCommand(from: PlayerCommand, to: PlayerCommand): void {
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.sprint = from.sprint;
  to.pass = from.pass;
  to.shoot = from.shoot;
  to.dribble = from.dribble;
}

/**
 * The human's command for the controlled player. Right after a switch the stick is ignored
 * (the player goes to the ball on his own) until it is released or turned; with the stick
 * released, the controlled player goes to meet a pass coming to him (autoReceive).
 */
function humanCommand(world: WorldState, human: PlayerCommand, receiver: number, tuning: Tuning, out: PlayerCommand): void {
  copyCommand(human, out);
  const m = tuning.mates;
  const mag = Math.hypot(human.moveX, human.moveY);
  if (!Number.isNaN(world.latchDir)) {
    const turned = mag >= 0.01 && Math.abs(wrapAngle(Math.atan2(human.moveY, human.moveX) - world.latchDir)) > m.switchLatchAngle;
    if (mag < 0.01 || turned) world.latchDir = Number.NaN;
  }
  const latched = !Number.isNaN(world.latchDir);
  if (receiver === world.controlled && (latched || (mag < 0.01 && m.autoReceive >= 0.5))) {
    interceptMove(world.players[world.controlled]!, world.ball, tuning, out);
    out.sprint = false;
  } else if (latched) {
    out.moveX = out.moveY = 0;
    out.sprint = false;
  }
}

/**
 * Advance the world exactly one fixed tick. `commands[0]` is the human's command and drives
 * the controlled player; teammates (`bot`) move on their own; any other player i is driven
 * by `commands[i]`.
 */
export function stepWorld(world: WorldState, commands: readonly PlayerCommand[], tuning: Tuning): void {
  const dt = 1 / tuning.sim.tickRate;
  const players = world.players;
  world.events.length = 0;
  const ball = world.ball;
  const human = commands[0] ?? IDLE;

  // Decide everyone's command from the state at the start of the tick.
  const receiver = findReceiver(players, ball, tuning);
  botCtx.players = players;
  botCtx.ball = ball;
  botCtx.controlled = world.controlled;
  botCtx.receiver = receiver;
  while (effective.length < players.length) effective.push(emptyCommand());
  for (let i = 0; i < players.length; i++) {
    const out = effective[i]!;
    if (i === world.controlled) humanCommand(world, human, receiver, tuning, out);
    else if (players[i]!.bot) botCommand(botCtx, i, tuning, out);
    else copyCommand(commands[i] ?? IDLE, out);
  }

  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    const cmd = effective[i]!;
    bufferActions(p, cmd, tuning);
    stepPlayer(p, cmd, tuning, dt, ball.owner === i);
    p.holdTime = ball.owner === i ? p.holdTime + dt : 0;
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
    const from = ball.owner;
    const owner = players[from]!;
    const released = provisionalActions(ball, owner, effective[from]!, tuning);
    if (released) afterRelease(world, from, released, human, tuning);
    else stepDribble(ball, owner, players, tuning, world.rng, dt);
  }
  if (ball.owner < 0) {
    stepBall(ball, players, tuning, world.rng, dt, world.events);
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      if (canPickUp(ball, p, tuning)) {
        pickUp(ball, i, p);
        p.holdTime = 0;
        // A teammate who gets the ball becomes the controlled player.
        if (tuning.mates.switchControl >= 0.5 && p.bot && p.team === players[world.controlled]?.team) switchControl(world, i, human);
        // Input buffer: a pass/shot pressed just before receiving fires now.
        const released = provisionalActions(ball, p, i === world.controlled ? human : effective[i]!, tuning);
        if (released) afterRelease(world, i, released, human, tuning);
        break;
      }
    }
  }
  freePlayBallRules(world);
  world.tick++;
}

/**
 * After the controlled player passes: PROVISIONAL aim assist until F1.4b (a teammate near the
 * pass line gets it straight to his stick, leading his movement), and the control goes
 * straight to that receiver (FIFA-like, docs/03 §3).
 */
function afterRelease(world: WorldState, from: number, how: 'shot' | 'pass', human: PlayerCommand, tuning: Tuning): void {
  if (how !== 'pass' || from !== world.controlled) return;
  const ball = world.ball;
  const to = findReceiver(world.players, ball, tuning, from);
  if (to < 0) return;
  const r = world.players[to]!;
  const speed = Math.hypot(ball.vx, ball.vy);
  // Where his blade will be once he turns to face the ball: to the right of his body.
  const face = Math.atan2(ball.y - r.y, ball.x - r.x);
  const side = dribbleFor(r, tuning).stickSide;
  const tx = r.x + Math.sin(face) * side;
  const ty = r.y - Math.cos(face) * side;
  const lead = Math.hypot(tx - ball.x, ty - ball.y) / Math.max(1, speed);
  const a = Math.atan2(ty + r.vy * lead - ball.y, tx + r.vx * lead - ball.x);
  ball.vx = Math.cos(a) * speed;
  ball.vy = Math.sin(a) * speed;
  if (tuning.mates.switchControl >= 0.5 && r.bot) switchControl(world, to, human);
}

/** Ball radius re-exported for the renderer. */
export const BALL_RADIUS = RINK.ballRadius;
