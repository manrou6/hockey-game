import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { createBall, placeBall, stepBall, type BallEvent, type BallState } from './ball';
import { emptyCommand, type PlayerCommand } from './commands';
import { bufferActions, pickupDistance, provisionalShot, stepDribble } from './dribble';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from './player';
import { boardSignedDistance, resolveStatic } from './rink';
import { createRng, type RngState } from './rng';
import { passFor, receiveFor, skatingFor, wallFor } from './feel';
import { receiveBall, RECEIVE_CLEAN, RECEIVE_HEAVY, type ReceiveOutcome } from './receive';
import { aimAngle, assistParams, choosePassTarget, createPassPlan, lockPassTarget, passKindFromHeight, passPower, performPass, planPass, PASS_GROUND, updatePassButton, type AssistLevel, type AssistParams, type PassKind, type PassPlan, type PassResult } from './pass';
import { ballApproach, botCommand, findReceiver, interceptMove, type Approach, type BotContext } from './mates';
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
  /** Player switching (v0.1.17): tick of the last switch (cooldown), and the teammate that
   * would take over while the ball is loose and for how many ticks he has been the nearest. */
  lastSwitchTick: number;
  switchCandidate: number;
  switchCandidateTicks: number;
  /** Pass assist level of the human (Settings): who the pass goes to and how much it's corrected. */
  assist: AssistLevel;
  /** Teammate the controlled player's pass would go to right now (−1 = none): the ring. */
  aimTarget: number;
  /**
   * The last pass while it travels: its receiver (−1 = none; he goes to meet it and has a
   * bigger reception zone), its kind (src/sim/pass.ts), who passed it (he doesn't chase his own
   * pass) and the point where it was aimed to meet the receiver's stick.
   */
  passTo: number;
  passKind: PassKind;
  passFrom: number;
  /** While the controlled player holds PASE with the ball: the pass as it would leave now
   * (direction with the assist, strength, kind) — drawn as the arrow on the floor. */
  aimPlan: PassPlan;
  aimActive: boolean;
  /** The controlled player's last pass as launched: tick, from where, direction, speed, kind. */
  lastPassTick: number;
  lastPassX: number;
  lastPassY: number;
  lastPassAngle: number;
  lastPassSpeed: number;
  lastPassKind: PassKind;
  meetX: number;
  meetY: number;
  /**
   * Wall pass (F1.4d): while a wall pass travels to the board, `wallFrom` is the passer
   * (otherwise −1); once it has bounced, `wallBack` is the passer it comes back to (it is then
   * also `passTo`: he gets the receiver's bigger reception zone and goes to meet it).
   * `wallX/Y` is where the ball will hit the board.
   */
  wallFrom: number;
  wallBack: number;
  wallX: number;
  wallY: number;
  /** The last reception (F1.4c): tick, who, and how it went (src/sim/receive.ts). */
  lastReceptionTick: number;
  lastReceptionPlayer: number;
  lastReceptionOutcome: ReceiveOutcome;
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
    lastSwitchTick: -1000,
    switchCandidate: -1,
    switchCandidateTicks: 0,
    assist: 'medium',
    aimTarget: -1,
    passTo: -1,
    passKind: PASS_GROUND,
    passFrom: -1,
    aimPlan: createPassPlan(),
    aimActive: false,
    lastPassTick: -1000,
    lastPassX: 0,
    lastPassY: 0,
    lastPassAngle: 0,
    lastPassSpeed: 0,
    lastPassKind: PASS_GROUND,
    meetX: Number.NaN,
    meetY: Number.NaN,
    wallFrom: -1,
    wallBack: -1,
    wallX: Number.NaN,
    wallY: Number.NaN,
    lastReceptionTick: -1000,
    lastReceptionPlayer: -1,
    lastReceptionOutcome: RECEIVE_CLEAN,
  };
}

/**
 * Give the human control of another player (FIFA-like switch, docs/03 §3). After a pass the
 * stick is latched (it was aiming the pass, not steering the new player); after a switch to
 * the player nearest the ball (automatic or CANVI) it isn't: you steer him at once.
 */
export function switchControl(world: WorldState, index: number, human: PlayerCommand, latch = true): void {
  if (index === world.controlled || !world.players[index]) return;
  world.controlled = index;
  world.lastSwitchTick = world.tick;
  world.switchCandidate = -1;
  world.switchCandidateTicks = 0;
  const m = Math.hypot(human.moveX, human.moveY);
  world.latchDir = latch && m >= 0.01 ? Math.atan2(human.moveY, human.moveX) : Number.NaN;
}

/** Is the ball free for the controlled player's team (nobody of the team carries it)? */
function ballLooseForTeam(world: WorldState): boolean {
  const b = world.ball;
  if (b.inGoal !== 0 || world.ballResetTicks > 0) return false;
  const team = world.players[world.controlled]?.team ?? 0;
  return b.owner < 0 || world.players[b.owner]!.team !== team;
}

/**
 * CANVI: switch to the teammate nearest the ball (a teammate carrying it: to him). If you are
 * already the nearest, to the next one. Nothing if you have the ball.
 */
function manualSwitch(world: WorldState, human: PlayerCommand): void {
  const b = world.ball;
  if (b.owner === world.controlled) return;
  const team = world.players[world.controlled]?.team ?? 0;
  if (b.owner >= 0 && world.players[b.owner]!.team === team) {
    switchControl(world, b.owner, human, false);
    return;
  }
  const to = nearestTeammate(world, b.x, b.y, world.controlled);
  if (to >= 0) switchControl(world, to, human, false);
}

/**
 * Automatic switch while the ball is loose: the teammate nearest the ball takes over, with
 * hysteresis so it never flickers between two players: he must be switchMargin nearer than
 * the controlled one for switchDelay, and not right after another switch. Not during a pass
 * (the receiver keeps it until the pass dies).
 */
function autoSwitch(world: WorldState, human: PlayerCommand, tuning: Tuning): void {
  const m = tuning.mates;
  const me = world.players[world.controlled];
  if (!me || m.autoSwitch < 0.5 || m.switchControl < 0.5 || world.passTo >= 0 || world.wallFrom >= 0 || !ballLooseForTeam(world)) {
    world.switchCandidate = -1;
    world.switchCandidateTicks = 0;
    return;
  }
  const b = world.ball;
  const cand = nearestTeammate(world, b.x, b.y, world.controlled);
  const dMe = Math.hypot(b.x - me.x, b.y - me.y);
  const c = world.players[cand];
  if (!c || Math.hypot(b.x - c.x, b.y - c.y) + m.switchMargin > dMe) {
    world.switchCandidate = -1;
    world.switchCandidateTicks = 0;
    return;
  }
  if (cand !== world.switchCandidate) {
    world.switchCandidate = cand;
    world.switchCandidateTicks = 0;
  }
  world.switchCandidateTicks++;
  const rate = tuning.sim.tickRate;
  if (world.switchCandidateTicks >= m.switchDelay * rate && world.tick - world.lastSwitchTick >= m.switchCooldown * rate) {
    switchControl(world, cand, human, false);
  }
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
const botCtx: BotContext = { players: [], ball: createBall(0, 0), controlled: 0, receiver: -1, time: 0, meetX: Number.NaN, meetY: Number.NaN };
const passResult: PassResult = { target: -1, kind: PASS_GROUND, meetX: 0, meetY: 0, wall: false, wallX: 0, wallY: 0 };
const assistTmp: AssistParams = { cone: 0, correction: 0, spaceRespect: 0, spaceCone: 0, spaceDeadzone: 0, spaceRamp: 0, spaceMinSpeed: 0 };

function copyCommand(from: PlayerCommand, to: PlayerCommand): void {
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.sprint = from.sprint;
  to.pass = from.pass;
  to.shoot = from.shoot;
  to.dribble = from.dribble;
  to.passHeld = from.passHeld;
  to.passHeight = from.passHeight;
  to.switchPlayer = from.switchPlayer;
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
    interceptMove(world.players[world.controlled]!, world.ball, tuning, out, world.passTo >= 0 ? world.meetX : Number.NaN, world.passTo >= 0 ? world.meetY : Number.NaN);
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
  const ball = world.ball;
  const human = commands[0] ?? IDLE;
  // A pass aimed at someone is his until somebody touches it, or it "dies": it hits something
  // (last tick's events), slows to a stop, or has gone past him out of reach.
  if (world.passTo >= 0 || world.passFrom >= 0) {
    const taken = ball.owner >= 0;
    const died = !taken && world.passTo >= 0 && passDied(world, tuning);
    if (world.wallFrom >= 0 && !taken && world.passTo < 0 && world.events.some((e) => e.type === 'board')) {
      // A wall pass has bounced off the board: it comes back to the passer, who goes to meet it.
      world.passTo = world.wallBack = world.wallFrom;
      world.wallFrom = -1;
      world.passFrom = -1;
    } else if (taken || died || (world.passTo < 0 && (Math.hypot(ball.vx, ball.vy) < 1 || hitSomething(world)))) {
      // A lost pass: the control goes to the teammate nearest the ball (if enabled).
      if (died && tuning.mates.lostPassSwitch >= 0.5 && tuning.mates.switchControl >= 0.5) {
        const nearest = nearestTeammate(world, ball.x, ball.y);
        if (nearest >= 0 && nearest !== world.controlled) switchControl(world, nearest, human, false);
      }
      world.passTo = -1;
      world.passFrom = -1; // off the boards the ball may be his again (wall pass, F1.4d)
      world.wallFrom = -1;
      world.wallBack = -1;
    }
  }
  world.events.length = 0;
  if (human.switchPlayer && tuning.mates.switchControl >= 0.5) manualSwitch(world, human);

  // Decide everyone's command from the state at the start of the tick.
  const receiver = world.passTo >= 0 ? world.passTo : findReceiver(players, ball, tuning, ball.owner < 0 ? world.passFrom : -1);
  botCtx.meetX = world.passTo >= 0 ? world.meetX : Number.NaN;
  botCtx.meetY = world.passTo >= 0 ? world.meetY : Number.NaN;
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
    if (updatePassButton(p, cmd, tuning, dt) === 'pressed') {
      // The receiver is chosen when PASE is pressed (the ring then stays on him).
      const level: AssistLevel = i === world.controlled ? world.assist : 'strong';
      lockPassTarget(players, i, aimAngle(p, i === world.controlled ? human : cmd), assistParams(level, tuning, assistTmp));
    }
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
      // The receiver of a pass has a bigger reception zone (stretching for it).
      const aimedAt = i === world.passTo;
      // The passer of a wall pass has a bigger zone for the ball coming back from the board.
      const reach = !aimedAt ? 0 : i === world.wallBack ? Math.max(receiveFor(p, tuning).reach, wallFor(p, tuning).reach) : receiveFor(p, tuning).reach;
      const blade = pickupDistance(ball, p, tuning, reach);
      if (blade < 0) continue;
      // One roll per approach: clean, heavy touch, rebound or miss (src/sim/receive.ts).
      const outcome = receiveBall(ball, i, p, blade, tuning, world.rng, world.events);
      world.lastReceptionTick = world.tick;
      world.lastReceptionPlayer = i;
      world.lastReceptionOutcome = outcome;
      if (outcome !== RECEIVE_CLEAN && outcome !== RECEIVE_HEAVY) {
        // A rebound off his stick ends the pass (it hit something); a miss goes on past him.
        break;
      }
      p.receivedKind = aimedAt ? world.passKind : PASS_GROUND;
      world.passTo = -1;
      world.passFrom = -1;
      world.wallFrom = world.wallBack = -1;
      // A teammate who gets the ball becomes the controlled player.
      if (tuning.mates.switchControl >= 0.5 && p.bot && p.team === players[world.controlled]?.team) switchControl(world, i, human);
      // Input buffer: a pass/shot released just before receiving fires now (first touch).
      ballActions(world, i, i === world.controlled ? human : effective[i]!, human, tuning);
      break;
    }
  }
  freePlayBallRules(world);
  autoSwitch(world, human, tuning);
  // Who the controlled player's pass would go to right now (ring under that teammate).
  const me = players[world.controlled];
  const assist = assistParams(world.assist, tuning, assistTmp);
  // While PASE is held the receiver is locked: the ring stays on him.
  world.aimTarget = !me || ball.owner !== world.controlled
    ? -1
    : me.passHold >= 0 && me.passLockTarget > -2
      ? me.passLockTarget
      : choosePassTarget(players, world.controlled, aimAngle(me, human), assist.cone, assist.spaceCone, assist.spaceMinSpeed);
  // The arrow: the pass as it would leave right now while PASE is held (no human error).
  world.aimActive = Boolean(me) && ball.owner === world.controlled && me!.passHold >= 0;
  if (world.aimActive) {
    const charge = passPower(me!.passHold, passFor(me!, tuning));
    planPass(players, ball, world.controlled, human, world.assist, passKindFromHeight(human.passHeight), charge, me!.passLockTarget, me!.passLockOffset, tuning, world.aimPlan);
  }
  world.tick++;
}

function hitSomething(world: WorldState): boolean {
  return world.events.some((e) => e.type !== 'floor');
}

const approachTmp: Approach = { dist: 0, t: 0 };

/**
 * Has the pass to world.passTo died without anybody touching it? It hit something, it is
 * almost stopped, or it has already gone past the receiver and is out of his reach.
 */
function passDied(world: WorldState, tuning: Tuning): boolean {
  const ball = world.ball;
  if (hitSomething(world) || Math.hypot(ball.vx, ball.vy) < 1) return true;
  const r = world.players[world.passTo];
  if (!r) return true;
  const a = ballApproach(ball, r.x, r.y, approachTmp);
  const reach = receiveFor(r, tuning).reach;
  return a !== null && a.t < -0.15 && Math.hypot(ball.x - r.x, ball.y - r.y) > reach + 1;
}

/** The player of the controlled player's team nearest to a point (optionally excluding one). */
function nearestTeammate(world: WorldState, x: number, y: number, exclude = -1): number {
  const team = world.players[world.controlled]?.team ?? 0;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i]!;
    if (i === exclude || p.team !== team || (!p.bot && i !== world.controlled)) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * The ball carrier shoots (provisional, F1.5) or passes if a press is queued. Teammates pass
 * with full assist; the human with his Settings level. Returns true if the ball left.
 */
function ballActions(world: WorldState, i: number, cmd: PlayerCommand, human: PlayerCommand, tuning: Tuning): boolean {
  const p = world.players[i]!;
  if (provisionalShot(world.ball, p, tuning)) {
    world.passTo = -1;
    world.wallFrom = world.wallBack = -1;
    return true;
  }
  if (p.bufPass <= 0) return false;
  const level: AssistLevel = i === world.controlled ? world.assist : 'strong';
  performPass(world.players, world.ball, i, cmd, level, world.rng, tuning, passResult);
  world.passTo = passResult.target;
  world.passKind = passResult.kind;
  world.passFrom = i;
  // A wall pass: the ball goes to the board; the passer gets it back once it has bounced.
  world.wallFrom = passResult.wall ? i : -1;
  world.wallBack = -1;
  world.wallX = passResult.wallX;
  world.wallY = passResult.wallY;
  if (i === world.controlled) {
    world.lastPassTick = world.tick;
    world.lastPassX = p.x;
    world.lastPassY = p.y;
    world.lastPassAngle = Math.atan2(world.ball.vy, world.ball.vx);
    world.lastPassSpeed = Math.hypot(world.ball.vx, world.ball.vy, world.ball.vz);
    world.lastPassKind = passResult.kind;
  }
  world.meetX = passResult.meetX;
  world.meetY = passResult.meetY;
  // Without an assisted receiver (assist off, or nobody in the cone) the teammate the ball is
  // actually heading to is the receiver: it doesn't steer the ball, it only means he goes for
  // it as the receiver of a pass (reception zone, no meeting point).
  if (world.passTo < 0 && !passResult.wall) world.passTo = findReceiver(world.players, world.ball, tuning, i);
  // FIFA-like: the control goes straight to the receiver.
  if (i === world.controlled && tuning.mates.switchControl >= 0.5) {
    const to = world.passTo;
    if (to >= 0 && world.players[to]!.bot) switchControl(world, to, human);
  }
  return true;
}

/** Ball radius re-exported for the renderer. */
export const BALL_RADIUS = RINK.ballRadius;
