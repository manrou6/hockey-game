import { goalLineX, RINK } from '../../../src/config/rink';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { pickUp } from '../../../src/sim/dribble';
import { dribbleFor, shotFor } from '../../../src/sim/feel';
import type { AssistLevel } from '../../../src/sim/pass';
import { createWorld, stepWorld } from '../../../src/sim/world';

// Shooting test bench (F1.5a): a scripted "human" shoots at the empty +x goal from a given
// distance and angle, standing, skating or at a sprint, aiming at one of 6 zones of the goal
// (left / centre / right × low / high) with the stick as option A says, with a thumb error.
// Deterministic (seeded). Run with
//   PATINS_BENCH=1 npx vitest run tests/unit/bench
// Not part of the normal test run (see shotBench.test.ts).

const TICK = 1 / 60;
const GX = goalLineX(1);
const R = RINK.ballRadius;

export type ShotState = 'stand' | 'skate' | 'sprint';
export type ShotType = 'quick' | 'half' | 'full';

export interface ShotCase {
  /** Distance from the ball to the centre of the goal (m) and angle from the goal axis (deg). */
  dist: number;
  angle: number;
  state: ShotState;
  type: ShotType;
  /** 0 low, 1 high, 2 chip (the diagonal drag). */
  height: number;
}

export interface ShotStats {
  n: number;
  /** % that cross the goal line between the posts and under the bar. */
  onTarget: number;
  /** % that also land in the zone the human aimed at (third of the width × lower / upper half). */
  inZone: number;
  /** % that hit a post or the bar. */
  woodwork: number;
  /** Seconds from pressing TIRO to the ball leaving the stick. */
  release: number;
  /** Ball speed at the goal line (m/s) and flight time to it (s), of those that reach it. */
  speedAtGoal: number;
  flight: number;
  /** Is the case possible (the shooter inside the rink)? */
  valid: boolean;
}

/** Human thumb error on the stick angle (±rad, uniform): the same as the passing bench. */
export const THUMB_ERROR = 0.12;
/** Human touch: a tap lasts this long (s); a half and a full charge are held for these. */
const HOLD: Record<ShotType, number> = { quick: 0.1, half: 0.5, full: 0.85 };
const START_SPEED: Record<ShotState, number> = { stand: 0, skate: 6, sprint: 9 };
const STICK: Record<ShotState, number> = { stand: 0.2, skate: 1, sprint: 1 };

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);

/** Can a shooter stand at this distance and angle inside the rink (1 m from the boards)? */
export function caseValid(c: ShotCase): boolean {
  const th = (c.angle * Math.PI) / 180;
  return c.dist * Math.sin(th) <= RINK.width / 2 - 1.5 && GX - c.dist * Math.cos(th) > -RINK.length / 2 + 2;
}

export function runShots(tuning: Tuning, level: AssistLevel, c: ShotCase, n = 300): ShotStats {
  const out: ShotStats = { n, onTarget: 0, inZone: 0, woodwork: 0, release: Number.NaN, speedAtGoal: Number.NaN, flight: Number.NaN, valid: caseValid(c) };
  if (!out.valid) return out;
  const k = shotFor({} as never, tuning);
  const half = RINK.goalWidth / 2 - k.postMargin;
  const range = level === 'strong' ? k.strongAimRange : level === 'light' ? k.lightAimRange : k.mediumAimRange;
  let on = 0;
  let zone = 0;
  let wood = 0;
  const releases: number[] = [];
  const speeds: number[] = [];
  const flights: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const rnd = lcg(seed * 7349 + c.dist * 31 + c.angle);
    const t = tuning;
    const w = createWorld(seed, 0);
    w.assist = level;
    const p = w.players[0]!;
    const sideY = seed % 2 ? 1 : -1;
    const th = ((c.angle * Math.PI) / 180) * sideY;
    const bx = GX - c.dist * Math.cos(th);
    const by = c.dist * Math.sin(th);
    const h = Math.atan2(-by, GX - bx);
    const d = dribbleFor(p, t);
    p.heading = p.prevHeading = h;
    p.x = p.prevX = bx - Math.cos(h) * d.stickForward - Math.sin(h) * d.stickSide;
    p.y = p.prevY = by - Math.sin(h) * d.stickForward + Math.cos(h) * d.stickSide;
    p.vx = Math.cos(h) * START_SPEED[c.state];
    p.vy = Math.sin(h) * START_SPEED[c.state];
    w.ball.x = w.ball.prevX = bx;
    w.ball.y = w.ball.prevY = by;
    pickUp(w.ball, 0, p);
    // The zone he wants: a third of the width (centre of it) and the low or high half.
    const u = Math.floor(rnd() * 3) - 1;
    const wantY = u * (RINK.goalWidth / 3);
    const wantHigh = c.height > 0;
    const noise = (rnd() * 2 - 1) * THUMB_ERROR;
    const aim = (): number => {
      const toCentre = Math.atan2(-w.ball.y, GX - w.ball.x);
      // Option A: the angle that maps to that point (assist off: straight at it).
      if (level === 'off') return Math.atan2(wantY - w.ball.y, GX - w.ball.x) + noise;
      return toCentre + Math.max(-1, Math.min(1, wantY / half)) * range + noise;
    };
    const holdTicks = Math.max(1, Math.round(HOLD[c.type] / TICK));
    const press = w.tick;
    const startShot = w.lastShotTick;
    let left = -1;
    for (let i = 0; i < holdTicks + 2 && left < 0; i++) {
      const a = aim();
      const m = STICK[c.state];
      const cmd: PlayerCommand = { ...emptyCommand(), moveX: Math.cos(a) * m, moveY: Math.sin(a) * m, sprint: c.state === 'sprint', shoot: i === 0, shootHeld: i < holdTicks - 1, shootHeight: c.height };
      stepWorld(w, [cmd], t);
      if (w.lastShotTick !== startShot) left = w.tick;
    }
    if (left < 0) continue;
    releases.push((left - press) * TICK);
    // Fly to the goal line (or not).
    let crossed = false;
    for (let i = 0; i < 240 && !crossed; i++) {
      const px = w.ball.x;
      const py = w.ball.y;
      const pz = w.ball.z;
      stepWorld(w, [emptyCommand()], t);
      if (w.events.some((e) => e.type === 'post')) {
        wood++;
        break;
      }
      if (px < GX && w.ball.x >= GX) {
        crossed = true;
        const f = (GX - px) / (w.ball.x - px);
        const y = py + (w.ball.y - py) * f;
        const z = pz + (w.ball.z - pz) * f;
        if (Math.abs(y) <= RINK.goalWidth / 2 - R && z <= RINK.goalHeight - R) {
          on++;
          speeds.push(Math.hypot(w.ball.vx, w.ball.vy, w.ball.vz));
          flights.push((w.tick - left) * TICK);
          const third = RINK.goalWidth / 6;
          const lat = y > third ? 1 : y < -third ? -1 : 0;
          const high = z >= RINK.goalHeight / 2;
          if (lat === u && high === wantHigh) zone++;
        }
      }
      if (w.ball.owner >= 0 || Math.hypot(w.ball.vx, w.ball.vy) < 0.5) break;
    }
  }
  out.onTarget = (100 * on) / n;
  out.inZone = (100 * zone) / n;
  out.woodwork = (100 * wood) / n;
  out.release = mean(releases);
  out.speedAtGoal = mean(speeds);
  out.flight = mean(flights);
  return out;
}

export function fmtShots(s: ShotStats): string {
  if (!s.valid) return '   (fuera de la pista)   ';
  return `${s.onTarget.toFixed(0).padStart(3)}% / zone ${s.inZone.toFixed(0).padStart(3)}%`;
}

export const BASE_TUNING = (): Tuning => structuredClone(TUNING);
