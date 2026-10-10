import { RINK } from '../config/rink';
import type { Tuning } from '../config/tuning';
import { createBall, placeBall, stepBall, type BallEvent, type BallState } from './ball';
import { emptyCommand, type PlayerCommand } from './commands';
import { bladePoint, bufferActions, highBallDistance, pickupDistance, pressureOn, stepDribble } from './dribble';
import { collidePlayers, createPlayer, stepPlayer, type PlayerState } from './player';
import { boardSignedDistance, goalFootprints, resolveStatic } from './rink';
import { createRng, type RngState } from './rng';
import { passFor, receiveFor, shotFor, skatingFor, volleyFor, wallFor } from './feel';
import { receiveBall, RECEIVE_CLEAN, RECEIVE_HEAVY, type ReceiveOutcome } from './receive';
import { aimAngle, assistParams, choosePassTarget, createPassPlan, lockPassTarget, passKindFromHeight, passPower, performPass, planPass, PASS_DRIVE, PASS_GROUND, updatePassButton, type AssistLevel, type AssistParams, type PassKind, type PassPlan, type PassResult } from './pass';
import { ballApproach, botCommand, findReceiver, interceptMove, type Approach, type BotContext } from './mates';
import { wrapAngle } from './player';
import { createVolleyContact, predictContact, strikeVolley, type VolleyContact } from './volley';
import { createShotPlan, createShotResult, goalDistance, holdForTurn, needsTurn, performShot, planShot, shotKindFromHeight, shotPower, startTurn, stepTurn, updateShotButton, SHOT_LOW, type ShotKind, type ShotPlan, type ShotResult } from './shot';

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
  /** How much that pass was planned to reach him in the air (F1.5e, src/sim/pass.ts driveAirWeight):
   * > 0 = a driven pass he may take down from the air with his stick (src/sim/receive.ts). */
  passAir: number;
  /** Last time a player took a driven pass in the air (tick, who; F1.5e), whatever the outcome. */
  lastHighTick: number;
  lastHighPlayer: number;
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
  /** While the controlled player carries the ball near the goal or holds TIRO: the shot as it
   * would leave now (F1.5a, src/sim/shot.ts) — drawn as the reticle on the goal. */
  shotAim: ShotPlan;
  shotAimActive: boolean;
  /** The last shot (any player): tick, who, from where, and how it was launched. */
  lastShotTick: number;
  lastShotPlayer: number;
  lastShotX: number;
  lastShotY: number;
  lastShot: ShotResult;
  /** Tick a turn shot (media vuelta) started (F1.5b). */
  lastTurnTick: number;
  /** Remate en el aire (F1.5d), for the controlled player. */
  volley: VolleyView;
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
    passAir: 0,
    lastHighTick: -1000,
    lastHighPlayer: -1,
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
    shotAim: createShotPlan(),
    shotAimActive: false,
    lastShotTick: -1000,
    lastShotPlayer: -1,
    lastShotX: 0,
    lastShotY: 0,
    lastShot: createShotResult(),
    lastTurnTick: -1000,
    volley: createVolleyView(),
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
  // A remate en el aire carried on the old player's stick (late release) ends here: the ball
  // drops where it is (v0.1.30; it used to jump to the new player's blade, §B F1).
  if (world.volley.hold > 0) closeVolley(world.volley);
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
/** The goal cages on the floor (players' collision boxes). */
const GOALS = goalFootprints();
/** Clearance (m) between an out ball put back in play and a goal cage. */
const OUT_DROP_CAGE_MARGIN = 0.1;

/** Free play (no rules yet): an out ball reappears in front of the player; a goal goes back to the centre. */
function freePlayBallRules(world: WorldState): void {
  const ball = world.ball;
  if (ball.out) {
    const p = world.players[world.controlled];
    let x = p ? p.x + Math.cos(p.heading) * 1.2 : 0;
    let y = p ? p.y + Math.sin(p.heading) * 1.2 : 0;
    // Keep the drop point well inside the boards, and out of the goal cages (v0.1.30, §B F3: it
    // could be put inside one and thrown out of it on the next tick): in front of the goal.
    const sd = boardSignedDistance(x, y, n);
    if (sd > -1) {
      x -= n.nx * (sd + 1);
      y -= n.ny * (sd + 1);
    }
    const m = RINK.ballRadius + OUT_DROP_CAGE_MARGIN;
    for (const f of GOALS) {
      if (x > f.minX - m && x < f.maxX + m && y > f.minY - m && y < f.maxY + m) x = f.minX > 0 ? f.minX - m : f.maxX + m;
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
const passResult: PassResult = { target: -1, kind: PASS_GROUND, meetX: 0, meetY: 0, wall: false, wallX: 0, wallY: 0, air: 0 };
const assistTmp: AssistParams = { cone: 0, correction: 0, spaceRespect: 0, spaceCone: 0, spaceDeadzone: 0, spaceRamp: 0, spaceMinSpeed: 0 };
const turnPlanTmp = createShotPlan();
const contactTmp: VolleyContact = createVolleyContact();

/** Remate en el aire (F1.5d) as the HUD and the next tick see it. */
export interface VolleyView {
  /** A ball in the air (not rolling) is coming within reach of the controlled player's stick. */
  incoming: boolean;
  /** ... at the right height for a remate en el aire (seconds to the contact, its height). */
  found: boolean;
  time: number;
  height: number;
  /** The timing span for TIR: open, how full its arc is (1 = the good moment: the contact) and whether now is good timing. */
  open: boolean;
  progress: number;
  good: boolean;
  /** Tick the ball got to his stick (−1 = not yet); ticks left of the stick carrying it after the contact (late release). */
  contactTick: number;
  hold: number;
  holdHeight: number;
  /** The ball's velocity when it got to the stick (the strike after a late release uses it). */
  inVx: number;
  inVy: number;
  inVz: number;
}

export function createVolleyView(): VolleyView {
  return { incoming: false, found: false, time: 0, height: 0, open: false, progress: 0, good: false, contactTick: -1, hold: 0, holdHeight: 0, inVx: 0, inVy: 0, inVz: 0 };
}

function closeVolley(v: VolleyView): void {
  v.incoming = v.found = v.open = v.good = false;
  v.progress = 0;
  v.contactTick = -1;
  v.hold = 0;
}

/** A ball carried on the stick at (x, y) stays inside the boards and out of the goal cages (the mouth is open). */
function carryFits(x: number, y: number): boolean {
  const r = RINK.ballRadius;
  if (boardSignedDistance(x, y, n) > -r) return false;
  for (const f of GOALS) {
    const side = f.minX > 0 ? 1 : -1;
    const lineX = side > 0 ? f.minX : f.maxX;
    if (side * (x - lineX) > 0 && x > f.minX - r && x < f.maxX + r && y > f.minY - r && y < f.maxY + r) return false;
  }
  return true;
}

/** The ball is in the air or bouncing (not rolling). */
function inAir(ball: BallState): boolean {
  return ball.z - RINK.ballRadius > 0.005 || Math.abs(ball.vz) > 0.05;
}

/** Is a remate en el aire armed for player p: TIRO pressed / held without the ball, or released within the timing span? */
function volleyArmed(world: WorldState, p: PlayerState, cmd: PlayerCommand, tuning: Tuning): boolean {
  if (!world.volley.found && world.volley.hold <= 0) return false;
  const half = Math.round((volleyFor(p, tuning).windowTime / 2) * tuning.sim.tickRate);
  return world.volley.hold > 0 || cmd.shoot || (cmd.shootHeld && !p.shotWithBall) || p.shotSinceRelease <= half;
}

/**
 * Remate en el aire (F1.5d), after everyone has moved: follow the loose ball ahead to the
 * controlled player's stick, keep the timing span for the HUD, and strike it when TIRO says so.
 * Returns true if the ball is being carried on the stick (late release): no ball physics then.
 */
function volleyStep(world: WorldState, human: PlayerCommand, tuning: Tuning): boolean {
  const v = world.volley;
  const ball = world.ball;
  const i = world.controlled;
  const p = world.players[i];
  if (!p || ball.owner >= 0 || ball.inGoal !== 0 || p.noPickupTicks > 0) {
    closeVolley(v);
    return false;
  }
  const k = volleyFor(p, tuning);
  const rate = tuning.sim.tickRate;
  const half = k.windowTime / 2;
  const blade = bladePoint(p, tuning);
  if (v.hold > 0 && !carryFits(blade.x, blade.y)) {
    // The stick can't carry the ball through a board or into a goal cage from outside (v0.1.30,
    // §B F2): the ball drops where it is.
    closeVolley(v);
    ball.vx = ball.vy = 0;
    return false;
  }
  if (v.hold > 0) {
    // Released late: the stick has been carrying the ball since the contact; it leaves on the release.
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.prevZ = ball.z;
    ball.x = blade.x;
    ball.y = blade.y;
    ball.z = RINK.ballRadius + v.holdHeight;
    ball.vx = p.vx;
    ball.vy = p.vy;
    ball.vz = 0;
    if (p.shotSinceRelease === 0) {
      // Struck as the ball that came (its speed and direction at the contact), from the blade.
      ball.vx = v.inVx;
      ball.vy = v.inVy;
      ball.vz = v.inVz;
      volleyShoot(world, i, human, (world.tick - v.contactTick) / rate, v.holdHeight, 0, tuning);
      return false;
    }
    v.hold--;
    if (v.hold <= 0 || p.shotHold < 0) {
      // Not released in time: the ball just drops off the stick.
      closeVolley(v);
      return false;
    }
    v.open = true;
    v.progress = 1;
    v.good = (world.tick - v.contactTick) / rate <= k.good;
    return true;
  }
  predictContact(ball, p, tuning, contactTmp);
  // In the air or bouncing (a rolling ball is a normal reception, F1.5b).
  v.incoming = contactTmp.passes && inAir(ball);
  v.found = contactTmp.found;
  // Only this ball's contact (v0.1.30, §B F4: with none, the shared scratch held another world's).
  v.time = contactTmp.found ? contactTmp.time : 0;
  v.height = contactTmp.found ? contactTmp.height : 0;
  if (!contactTmp.found) {
    closeVolley(v);
    return false;
  }
  const now = contactTmp.time < 0.5 / rate;
  if (now && v.contactTick < 0) v.contactTick = world.tick;
  if (v.contactTick >= 0) {
    const since = (world.tick - v.contactTick) / rate;
    v.open = since <= half;
    v.progress = 1;
    v.good = since <= k.good;
  } else {
    v.open = contactTmp.time <= half;
    v.progress = Math.min(1, Math.max(0, 1 - contactTmp.time / Math.max(1e-3, half)));
    v.good = contactTmp.time <= k.good;
  }
  if (!now) return false;
  // At the contact (or still within reach after it): released within the timing span → strike;
  // still held at the contact → the stick carries the ball until the release.
  const released = p.shotSinceRelease;
  if (released <= Math.round(half * rate) && !(p.shotHold >= 0)) {
    const timing = (world.tick - released - v.contactTick) / rate;
    if (Math.abs(timing) <= half + 1e-9) {
      volleyShoot(world, i, human, timing, contactTmp.height, contactTmp.dist, tuning);
      return false;
    }
  }
  if (p.shotHold >= 0 && !p.shotWithBall && (world.tick - v.contactTick) / rate <= half) {
    v.hold = Math.max(1, Math.round(half * rate));
    v.holdHeight = contactTmp.height;
    v.inVx = ball.vx;
    v.inVy = ball.vy;
    v.inVz = ball.vz;
    return false;
  }
  return false;
}

function volleyShoot(world: WorldState, i: number, human: PlayerCommand, timing: number, height: number, bladeDist: number, tuning: Tuning): void {
  const p = world.players[i]!;
  world.lastShotX = world.ball.x;
  world.lastShotY = world.ball.y;
  strikeVolley(p, world.ball, human, world.assist, timing, height, bladeDist, pressureOn(p, world.players, tuning), world.rng, tuning, world.lastShot);
  world.lastShotTick = world.tick;
  world.lastShotPlayer = i;
  world.passTo = -1;
  world.passFrom = -1;
  world.wallFrom = world.wallBack = -1;
  closeVolley(world.volley);
}

function copyCommand(from: PlayerCommand, to: PlayerCommand): void {
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.sprint = from.sprint;
  to.pass = from.pass;
  to.shoot = from.shoot;
  to.dribble = from.dribble;
  to.passHeld = from.passHeld;
  to.passHeight = from.passHeight;
  to.shootHeld = from.shootHeld;
  to.shootHeight = from.shootHeight;
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
  // A ball in the air coming to him, or a remate en el aire armed (F1.5d): the joystick only
  // aims (the shot reads it), he keeps meeting the ball. A driven pass in the air aimed at him
  // is coming to him from the moment it leaves, before its path meets his blade (v0.1.29:
  // aiming at the goal while it flew used to drop it and lose the pass; v0.1.30: also the long
  // one, beyond pass.driveAirEnd, that lands before him and bounces, §B F6).
  const me = world.players[world.controlled];
  const aerialPass = world.passTo === world.controlled && (world.passAir > 0 || world.passKind === PASS_DRIVE) && inAir(world.ball);
  const volley = me !== undefined && world.ball.owner < 0 && (world.volley.incoming || aerialPass || volleyArmed(world, me, human, tuning));
  if (receiver === world.controlled && (latched || (mag < 0.01 && m.autoReceive >= 0.5) || volley)) {
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
    // Turning to shoot (media vuelta): he just glides round; buttons wait. Tapping TIRO with the
    // goal behind, the stick does not turn him first (the media vuelta will).
    if (players[i]!.shotTurn > 0) {
      out.moveX = out.moveY = 0;
      out.sprint = out.pass = out.shoot = out.passHeld = out.shootHeld = false;
    } else holdForTurn(players[i]!, ball, out, ball.owner === i, tuning);
  }

  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    const cmd = effective[i]!;
    bufferActions(p, cmd, tuning);
    // PASE and TIRO: one at a time (charging a shot, PASE is ignored).
    if (p.shotHold < 0 && p.shotTurn <= 0 && updatePassButton(p, cmd, tuning, dt) === 'pressed') {
      // The receiver is chosen when PASE is pressed (the ring then stays on him).
      const level: AssistLevel = i === world.controlled ? world.assist : 'strong';
      lockPassTarget(players, i, aimAngle(p, i === world.controlled ? human : cmd), assistParams(level, tuning, assistTmp));
    }
    updateShotButton(p, cmd, tuning, dt, ball.owner === i);
    stepPlayer(p, cmd, tuning, dt, ball.owner === i);
    stepTurn(p, ball.owner === i, tuning, dt);
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
  // Remate en el aire (F1.5d): may strike the loose ball, or carry it on the stick (late release).
  const carried = volleyStep(world, human, tuning);
  // Ball: carried on a stick, or free physics (then maybe someone takes it).
  if (ball.owner >= 0) {
    const from = ball.owner;
    if (!ballActions(world, from, from === world.controlled ? human : effective[from]!, human, tuning)) {
      stepDribble(ball, players[from]!, players, tuning, world.rng, dt);
    }
  }
  if (ball.owner < 0 && !carried) {
    stepBall(ball, players, tuning, world.rng, dt, world.events);
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      // A remate en el aire armed (F1.5d): he strikes the ball instead of controlling it.
      if (i === world.controlled && volleyArmed(world, p, human, tuning)) continue;
      // The receiver of a pass has a bigger reception zone (stretching for it).
      const aimedAt = i === world.passTo;
      // The passer of a wall pass has a bigger zone for the ball coming back from the board.
      const reach = !aimedAt ? 0 : i === world.wallBack ? Math.max(receiveFor(p, tuning).reach, wallFor(p, tuning).reach) : receiveFor(p, tuning).reach;
      let blade = pickupDistance(ball, p, tuning, reach);
      let high = false;
      if (blade < 0) {
        // A driven pass that comes in the air (F1.5e): its receiver takes it down with the stick.
        if (!aimedAt || world.passAir <= 0) continue;
        // The player you control does it at his stick (where he would strike it, F1.5d), not as
        // soon as it is within his reach: until then he may still press TIR.
        const mine = i === world.controlled && world.volley.found;
        if (mine && world.volley.time >= 0.5 / tuning.sim.tickRate) continue;
        blade = highBallDistance(ball, p, tuning, reach, mine ? volleyFor(p, tuning).reach : 0);
        if (blade < 0) continue;
        high = true;
        world.lastHighTick = world.tick;
        world.lastHighPlayer = i;
      }
      // One roll per approach: clean, heavy touch, rebound or miss (src/sim/receive.ts).
      const outcome = receiveBall(ball, i, p, blade, tuning, world.rng, world.events, high);
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
  // The shot reticle: while carrying the ball near the goal, or charging a shot.
  world.shotAimActive = false;
  if (me && ball.owner === world.controlled) {
    const k = shotFor(me, tuning);
    const charging = me.shotHold >= 0;
    if (charging || goalDistance(me, ball) <= k.reticleRange) {
      const kind: ShotKind = charging ? shotKindFromHeight(human.shootHeight) : SHOT_LOW;
      const quick = !charging || me.shotHold < k.tapTime;
      planShot(me, ball, human, world.assist, kind, charging ? shotPower(me.shotHold, k) : 0, quick, tuning, world.shotAim);
      world.shotAimActive = world.shotAim.aimed;
    }
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
 * The ball carrier shoots (F1.5a) or passes if a press is queued. Teammates pass
 * with full assist; the human with his Settings level. Returns true if the ball left.
 */
function ballActions(world: WorldState, i: number, cmd: PlayerCommand, human: PlayerCommand, tuning: Tuning): boolean {
  const p = world.players[i]!;
  if (p.bufShoot > 0) {
    // TIRO (F1.5a): the human with his Settings assist level, teammates with Fuerte.
    const shotCmd = i === world.controlled ? human : cmd;
    const level: AssistLevel = i === world.controlled ? world.assist : 'strong';
    // Near the goal with his back to it: a quick turn first (media vuelta, F1.5b).
    const plan = planShot(p, world.ball, shotCmd, level, p.shotKind as ShotKind, p.shotCharge, p.shotQuick, tuning, turnPlanTmp);
    if (needsTurn(p, world.ball, plan, tuning)) {
      startTurn(p, plan, tuning);
      world.lastTurnTick = world.tick;
      return false;
    }
    world.lastShotX = world.ball.x;
    world.lastShotY = world.ball.y;
    performShot(p, world.ball, shotCmd, level, world.rng, tuning, world.lastShot, pressureOn(p, world.players, tuning));
    world.lastShotTick = world.tick;
    world.lastShotPlayer = i;
    world.passTo = -1;
    world.passFrom = -1;
    world.wallFrom = world.wallBack = -1;
    return true;
  }
  if (p.bufPass <= 0) return false;
  const level: AssistLevel = i === world.controlled ? world.assist : 'strong';
  performPass(world.players, world.ball, i, cmd, level, world.rng, tuning, passResult);
  world.passTo = passResult.target;
  world.passKind = passResult.kind;
  world.passFrom = i;
  world.passAir = passResult.air;
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
