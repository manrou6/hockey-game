import { goalLineX } from '../../../src/config/rink';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { createPlayer, createWorld, type PlayerState, type WorldState } from '../../../src/sim/world';

// Helpers of the performance bench (docs/audit/C.md, §C of docs/AUDITORIA_F1.md). Test-only:
// a provisional, deterministic "AI" to fill the rink with 10 entities (8 skaters + 2
// goalkeepers) and drive them through ordinary PlayerCommands. It is NOT the F2 AI
// (docs/PLAN_F2.md): it only chases the ball, passes and shoots so that every expensive path
// of today's sim (passes of all kinds, shots, volleys, receptions, rebounds, collisions) runs.

/** Seeded LCG in [0, 1) (no Math.random: same numbers on every run). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Index of the two goalkeepers in the stress world (they are plain skaters standing in goal). */
export const GK0 = 4;
export const GK1 = 9;

/**
 * 10 entities: team 0 = indices 0-3 (createWorld's human + teammates, bot = true: the sim's own
 * F1.4 teammates drive the ones the human does not control) + goalkeeper 4 (bot = false); team 1
 * = skaters 5-8 + goalkeeper 9 (bot = false: driven by `stressCommands`).
 */
export function createStressWorld(seed: number): WorldState {
  const w = createWorld(seed, 3);
  const gx = goalLineX(1);
  const gk0 = createPlayer(GK0, -gx + 0.9, 0, 0);
  w.players.push(gk0);
  for (let k = 0; k < 4; k++) {
    const p = createPlayer(5 + k, 3 + (k >> 1) * 6, (k % 2 === 0 ? 1 : -1) * 4, Math.PI);
    p.team = 1;
    w.players.push(p);
  }
  const gk1 = createPlayer(GK1, gx - 0.9, 0, Math.PI);
  gk1.team = 1;
  w.players.push(gk1);
  return w;
}

/** Per-player memory of the test AI (button holds in progress, wander). */
export interface AiMem {
  passHold: number;
  passHeight: number;
  shootHold: number;
  shootHeight: number;
  aim: number;
  wanderDir: number;
  wanderTicks: number;
  mode: number;
}

export function createAiMem(n: number): AiMem[] {
  return Array.from({ length: n }, () => ({ passHold: 0, passHeight: 0, shootHold: 0, shootHeight: 0, aim: 0, wanderDir: 0, wanderTicks: 0, mode: 0 }));
}

function setStick(out: PlayerCommand, angle: number, mag: number): void {
  out.moveX = Math.cos(angle) * mag;
  out.moveY = Math.sin(angle) * mag;
}

function moveToward(p: PlayerState, x: number, y: number, out: PlayerCommand, speed: number): void {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.4) {
    out.moveX = out.moveY = 0;
    return;
  }
  setStick(out, Math.atan2(dy, dx), Math.max(0.2, speed * Math.min(1, d / 1.5)));
  out.sprint = d > 6 && speed >= 0.9;
}

function nearestOfTeam(w: WorldState, team: number, x: number, y: number, skipGk: boolean): number {
  let best = -1;
  let bestD = Infinity;
  for (let j = 0; j < w.players.length; j++) {
    const o = w.players[j]!;
    if (o.team !== team || (skipGk && (j === GK0 || j === GK1))) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bestD) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/**
 * Command of one entity `i` (written into `out`). `random` makes the stick wander more (the
 * "random but seeded" human of the current-world bench).
 */
export function aiCommand(w: WorldState, i: number, mem: AiMem, rnd: () => number, out: PlayerCommand, random: boolean): void {
  const p = w.players[i]!;
  const ball = w.ball;
  const attack = p.team === 0 ? 1 : -1;
  const gx = goalLineX(attack as 1 | -1);
  out.pass = out.shoot = out.dribble = out.switchPlayer = false;
  out.sprint = false;
  // A PASE / TIRO hold in progress: keep it (the stick keeps aiming), release when it runs out.
  if (mem.passHold > 0) {
    mem.passHold--;
    out.passHeld = mem.passHold > 0;
    out.passHeight = mem.passHeight;
    setStick(out, mem.aim, 1);
    return;
  }
  out.passHeld = false;
  if (mem.shootHold > 0) {
    mem.shootHold--;
    out.shootHeld = mem.shootHold > 0;
    out.shootHeight = mem.shootHeight;
    setStick(out, Math.atan2(-ball.y * 0.3, gx - p.x), 1);
    return;
  }
  out.shootHeld = false;
  const isGk = i === GK0 || i === GK1;
  if (ball.owner === i) {
    const dGoal = Math.hypot(gx - ball.x, ball.y);
    if (!isGk && dGoal < 13 && rnd() < 0.06) {
      // TIRO: a tap or a drag charge of up to 0.6 s, low / high / chip.
      out.shoot = true;
      mem.shootHold = rnd() < 0.5 ? 1 : 1 + Math.floor(rnd() * 36);
      out.shootHeld = mem.shootHold > 1;
      mem.shootHeight = rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2;
      out.shootHeight = mem.shootHeight;
      setStick(out, Math.atan2(-ball.y * 0.3, gx - p.x), 1);
      return;
    }
    if (p.holdTime > (isGk ? 0.8 : 0.5) && rnd() < (isGk ? 0.2 : 0.05)) {
      // PASE to a random teammate: tap, short or long hold; ground / driven lofted / lob.
      let j = -1;
      for (let tries = 0; tries < 6 && j < 0; tries++) {
        const c = Math.floor(rnd() * w.players.length);
        if (c !== i && w.players[c]!.team === p.team) j = c;
      }
      if (j >= 0) {
        const r = w.players[j]!;
        mem.aim = Math.atan2(r.y - p.y, r.x - p.x) + (rnd() - 0.5) * 0.3;
        out.pass = true;
        mem.passHold = rnd() < 0.4 ? 0 : Math.floor(rnd() * 45);
        mem.passHeight = rnd() < 0.45 ? 0 : rnd() < 0.65 ? 1 : 2;
        out.passHeld = mem.passHold > 0;
        out.passHeight = mem.passHeight;
        setStick(out, mem.aim, 1);
        return;
      }
    }
    // Carry it towards the attacked goal, weaving; sprint in phases.
    const weave = 0.7 * Math.sin(w.tick * 0.05 + i * 1.7);
    setStick(out, Math.atan2(-p.y * 0.4, gx - p.x) + weave, 0.85);
    out.sprint = Math.sin(w.tick * 0.021 + i) > 0.3;
    if (rnd() < 0.004) out.dribble = true;
    return;
  }
  if (isGk) {
    // Stay in goal, sliding with the ball; face it.
    const ty = Math.max(-1.1, Math.min(1.1, ball.y * 0.3));
    const tx = -gx + attack * 0.9;
    if (Math.hypot(tx - p.x, ty - p.y) > 0.3) moveToward(p, tx, ty, out, 0.8);
    else setStick(out, Math.atan2(ball.y - p.y, ball.x - p.x), 0.06);
    return;
  }
  // A remate en el aire coming to the controlled player: TIRO on the cue (F1.5d).
  if (i === w.controlled && w.volley.found && w.volley.time < 0.12 && rnd() < 0.7) {
    out.shoot = true;
    mem.shootHold = 1;
    out.shootHeld = false;
    setStick(out, Math.atan2(-ball.y * 0.3, gx - p.x), 1);
    return;
  }
  // A pass coming to the controlled player: let the sim meet it (stick released).
  if (i === w.controlled && w.passTo === i) {
    out.moveX = out.moveY = 0;
    return;
  }
  if (random) {
    if (--mem.wanderTicks <= 0) {
      mem.wanderTicks = 8 + Math.floor(rnd() * 32);
      mem.mode = rnd() < 0.5 ? 0 : rnd() < 0.7 ? 1 : 2;
      mem.wanderDir = rnd() * Math.PI * 2;
    }
    if (mem.mode === 1) {
      setStick(out, mem.wanderDir, 0.5 + 0.5 * rnd());
      out.sprint = rnd() < 0.3;
      if (rnd() < 0.003) out.switchPlayer = true;
      return;
    }
    if (mem.mode === 2) {
      out.moveX = out.moveY = 0;
      return;
    }
  }
  const loose = ball.owner < 0;
  const ownTeamHasIt = !loose && w.players[ball.owner]!.team === p.team;
  if (!ownTeamHasIt && nearestOfTeam(w, p.team, ball.x, ball.y, true) === i) {
    // Chase the ball (lead it a little).
    moveToward(p, ball.x + ball.vx * 0.2, ball.y + ball.vy * 0.2, out, 1);
    return;
  }
  // Support (own team has it) or cover (the other team has it): a spot by role around the ball.
  const role = i % 4;
  const side = role % 2 === 0 ? 1 : -1;
  const tx = ownTeamHasIt ? ball.x + attack * (3 + role) : ball.x - attack * (2 + role * 1.5);
  const ty = Math.max(-8, Math.min(8, ball.y * 0.5 + side * (2.5 + (role >> 1) * 2)));
  moveToward(p, Math.max(-16, Math.min(16, tx)), ty, out, 0.75);
}

/**
 * Commands for one tick of the stress world: the controlled player (commands[0], the "human")
 * and every non-bot entity (commands[i]); the bot teammates are driven by the sim itself.
 */
export function stressCommands(w: WorldState, cmds: PlayerCommand[], mem: AiMem[], rnd: () => number): void {
  while (cmds.length < w.players.length) cmds.push(emptyCommand());
  for (let i = 0; i < w.players.length; i++) {
    const p = w.players[i]!;
    if (i === w.controlled) aiCommand(w, i, mem[i]!, rnd, cmds[0]!, false);
    else if (!p.bot) aiCommand(w, i, mem[i]!, rnd, cmds[i]!, false);
  }
}

/** Commands of the current world (3 players): only the human, with random-but-seeded input. */
export function humanCommands(w: WorldState, cmds: PlayerCommand[], mem: AiMem[], rnd: () => number): void {
  aiCommand(w, w.controlled, mem[0]!, rnd, cmds[0]!, true);
}

/** Summary of per-tick samples (µs). */
export interface Summary {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Worst sum of 2 / 5 consecutive ticks (a frame at 140 % game speed / a catch-up frame). */
  max2: number;
  max5: number;
}

export function summarize(samples: Float64Array, n = samples.length): Summary {
  const s = Float64Array.from(samples.subarray(0, n)).sort();
  const at = (q: number): number => s[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))]!;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i]!;
  let max2 = 0;
  let max5 = 0;
  for (let i = 0; i + 1 < n; i++) max2 = Math.max(max2, samples[i]! + samples[i + 1]!);
  for (let i = 0; i + 4 < n; i++) max5 = Math.max(max5, samples[i]! + samples[i + 1]! + samples[i + 2]! + samples[i + 3]! + samples[i + 4]!);
  return { n, mean: sum / n, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[n - 1]!, max2, max5 };
}

export function fmt(s: Summary): string {
  const f = (x: number): string => x.toFixed(1);
  return `n=${s.n} mean=${f(s.mean)} p50=${f(s.p50)} p95=${f(s.p95)} p99=${f(s.p99)} max=${f(s.max)} max2=${f(s.max2)} max5=${f(s.max5)} µs`;
}
