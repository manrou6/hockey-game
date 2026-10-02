import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { createBall, placeBall, stepBall, type BallEvent, type BallState } from './ball';
import { emptyCommand, type PlayerCommand } from './commands';
import { bufferActions, canPickUp, pickUp, provisionalShot, stepDribble } from './dribble';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from './player';
import { boardSignedDistance, resolveStatic } from './rink';
import { createRng, type RngState } from './rng';
import { skatingFor } from './feel';
import { aimAngle, assistParams, choosePassTarget, performPass, updatePassButton, type AssistLevel, type AssistParams, type PassResult } from './pass';
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
  /** Pass assist level of the human (Settings): who the pass goes to and how much it's corrected. */
  assist: AssistLevel;
  /** Teammate the controlled player's pass would go to right now (−1 = none): the ring. */
  aimTarget: number;
  /** Receiver of the last pass while it travels (−1 = none) and whether it was lofted. */
  passTo: number;
  passLoft: boolean;
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
    assist: 'light',
    aimTarget: -1,
    passTo: -1,
    passLoft: false,
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
const botCtx: BotContext = { players: [], ball: createBall(0, 0), controlled: 0, receiver: -1, time: 0 };
const passResult: PassResult = { target: -1, loft: false };
const assistTmp: AssistParams = { cone: 0, correction: 0 };

function copyCommand(from: PlayerCommand, to: PlayerCommand): void {
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.sprint = from.sprint;
  to.pass = from.pass;
  to.shoot = from.shoot;
  to.dribble = from.dribble;
  to.passHeld = from.passHeld;
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
  botCtx.time = world.tick * dt;
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
    updatePassButton(p, cmd, tuning, dt);
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
    if (!ballActions(world, from, from === world.controlled ? human : effective[from]!, human, tuning)) {
      stepDribble(ball, players[from]!, players, tuning, world.rng, dt);
    }
  }
  if (ball.owner < 0) {
    stepBall(ball, players, tuning, world.rng, dt, world.events);
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      if (canPickUp(ball, p, tuning)) {
        pickUp(ball, i, p);
        p.holdTime = 0;
        p.receivedLoft = i === world.passTo && world.passLoft;
        world.passTo = -1;
        // A teammate who gets the ball becomes the controlled player.
        if (tuning.mates.switchControl >= 0.5 && p.bot && p.team === players[world.controlled]?.team) switchControl(world, i, human);
        // Input buffer: a pass/shot released just before receiving fires now (first touch).
        ballActions(world, i, i === world.controlled ? human : effective[i]!, human, tuning);
        break;
      }
    }
  }
  freePlayBallRules(world);
  // Who the controlled player's pass would go to right now (ring under that teammate).
  const me = players[world.controlled];
  world.aimTarget =
    me && ball.owner === world.controlled
      ? choosePassTarget(players, world.controlled, aimAngle(me, human), assistParams(world.assist, tuning, assistTmp).cone)
      : -1;
  world.tick++;
}

/**
 * The ball carrier shoots (provisional, F1.5) or passes if a press is queued. Teammates pass
 * with full assist; the human with his Settings level. Returns true if the ball left.
 */
function ballActions(world: WorldState, i: number, cmd: PlayerCommand, human: PlayerCommand, tuning: Tuning): boolean {
  const p = world.players[i]!;
  if (provisionalShot(world.ball, p, tuning)) {
    world.passTo = -1;
    return true;
  }
  if (p.bufPass <= 0) return false;
  const level: AssistLevel = i === world.controlled ? world.assist : 'strong';
  performPass(world.players, world.ball, i, cmd, level, world.rng, tuning, passResult);
  world.passTo = passResult.target;
  world.passLoft = passResult.loft;
  // FIFA-like: the control goes straight to the receiver (or, with no assisted receiver,
  // to the teammate the ball is heading to).
  if (i === world.controlled && tuning.mates.switchControl >= 0.5) {
    const to = passResult.target >= 0 ? passResult.target : findReceiver(world.players, world.ball, tuning, i);
    if (to >= 0 && world.players[to]!.bot) switchControl(world, to, human);
  }
  return true;
}

/** Ball radius re-exported for the renderer. */
export const BALL_RADIUS = RINK.ballRadius;
