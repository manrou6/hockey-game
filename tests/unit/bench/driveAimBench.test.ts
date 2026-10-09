import { describe, it } from 'vitest';
import { RINK } from '../../../src/config/rink';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { bladePoint, pickUp } from '../../../src/sim/dribble';
import { dribbleFor } from '../../../src/sim/feel';
import type { AssistLevel } from '../../../src/sim/pass';
import { isCutting, isSkidding } from '../../../src/sim/player';
import { createWorld, stepWorld } from '../../../src/sim/world';

// Aim of the driven lofted pass ("alt fort", PASE with passHeight 1, a tap = automatic power) to a
// teammate 8-16 m away, which since v0.1.28 (F1.5e) reaches him IN THE AIR at ~0.5 m and must be
// taken down with the stick. A scripted human aims at the teammate (where he SEES him) with a
// thumb error of ±0.12 rad (uniform, as the other benches), standing or at a sprint (with the
// ball: stick at full + sprint, ~9.3 m/s), to a teammate standing or running across the line of
// sight (6.5 m/s, like the pass-into-space bench). The control switches to the receiver as the
// pass leaves and the human leaves the stick alone (he goes to meet it on his own).
//
// Measured per case (the same seeds, geometry and thumb error for every assist level: paired):
//  - miss: horizontal distance from the ball to the receiver's blade (src/sim/dribble.ts
//    bladePoint) at his first touch of it, or where it passes closest if he never touches it; split
//    into lateral (across the ball's path) and longitudinal (along it: + = past the blade);
//  - launch: how far the launched ball's line passes from the point the assist aimed at (the meet
//    point): the aiming error before the receiver corrects anything;
//  - has % (he ends with the ball within 4 s), clean % (first touch clean), air % (taken in the air).
// Reading it (v0.1.29): the receiver goes to meet the ball, so the miss at the blade is mostly his
// own contact geometry (0.2-0.4 m even with every error at 0) and has % stays ~100 % in front of the
// passer; the aim itself shows in `launch`. Other tests: which error term dominates, the aim ahead
// of a runner (freedom), wide angles at a sprint (trencada), Forta vs Mitjana with a sloppier aim,
// and a sweep of the driven-only numbers (pass.driveErrorFactor, pass.driveMediumCorrection).
// Benchmarks (not assertions): PATINS_BENCH=1 npx vitest run tests/unit/bench/driveAimBench
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const run = env.PATINS_BENCH ? describe : describe.skip;

const R = RINK.ballRadius;
/** Human thumb error on the aim (±rad, uniform), as the other benches. */
const THUMB = 0.12;
/** Speed of a teammate running across the line of sight (m/s), as the pass-into-space bench. */
const RUN_SPEED = 6.5;
/** Ticks of sprinting with the ball before the pass (the dribble settles into its sprint rhythm). */
const RUN_UP = 30;
const DISTS = [8, 10, 12, 14, 16];
/** Passes per case (PATINS_DRIVE_SEEDS overrides it for a quick look). */
const SEEDS = Number(env.PATINS_DRIVE_SEEDS) || 500;

type PasserState = 'still' | 'sprint';
type ReceiverState = 'still' | 'run';

interface DriveCase {
  level: AssistLevel;
  passer: PasserState;
  receiver: ReceiverState;
  /** Passer-receiver distance at the press (m). */
  dist: number;
  n?: number;
  /** Human thumb error (±rad). Default THUMB. */
  thumb?: number;
  /** Aim this far (rad) AHEAD of a running receiver instead of at him (freedom check). Default 0. */
  aimAhead?: number;
  /** A sloppier aim: this far (rad) off the teammate on top of the thumb error (a standing
   * teammate: to either side; a runner: behind him, so it is never a pass into space). Default 0. */
  aimBias?: number;
  /** Bearing of the receiver from the passer's skating direction (rad): |bearing| in [min, max].
   * Default [0, 0.9]: in front, so the stick turned to aim never makes a trencada (cut.minAngle). */
  bearing?: [number, number];
}

interface DriveStats {
  n: number;
  /** % with the ball within 4 s, % first touch clean, % taken in the air. */
  has: number;
  clean: number;
  air: number;
  /** Final miss at the blade (m): total, |lateral|, |longitudinal|; mean and p90. */
  missMean: number;
  missP90: number;
  latMean: number;
  latP90: number;
  lonMean: number;
  lonP90: number;
  /** Launch line vs the assist's meet point (m): mean and p90 of |offset|. */
  launchMean: number;
  launchP90: number;
  /** Ball height above the floor at that moment (m), mean. */
  heightMean: number;
  /** Passer speed at the release (m/s), mean; % of passes released during a trencada or a skid (off balance). */
  passerSpeed: number;
  offBalance: number;
  /** Launched direction ahead of the receiver (deg, + = towards where he runs), mean (freedom check). */
  aheadDeg: number;
}

const cmd = (x = 0, y = 0, extra: Partial<PlayerCommand> = {}): PlayerCommand => ({ ...emptyCommand(), moveX: x, moveY: y, ...extra });

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);
const p90 = (a: number[]): number => {
  if (!a.length) return Number.NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.9 * s.length))]!;
};

function runDrive(tuning: Tuning, c: DriveCase): DriveStats {
  const n = c.n ?? SEEDS;
  const thumb = c.thumb ?? THUMB;
  let has = 0;
  let clean = 0;
  let air = 0;
  let valid = 0;
  const miss: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const launch: number[] = [];
  const heights: number[] = [];
  const speeds: number[] = [];
  const aheads: number[] = [];
  let offBalance = 0;
  for (let seed = 1; seed <= n; seed++) {
    // The geometry and the thumb error depend only on the seed and the case (not on the level).
    const rnd = lcg(seed * 7919 + c.dist * 131 + (c.passer === 'sprint' ? 17 : 0) + (c.receiver === 'run' ? 29 : 0));
    const t = tuning;
    const w = createWorld(seed, 2);
    w.assist = c.level;
    const p = w.players[0]!;
    const r = w.players[1]!;
    const o = w.players[2]!;
    // The two teammates stand aside (inert) until the pass.
    r.bot = o.bot = false;
    r.x = r.prevX = 15;
    r.y = r.prevY = -8.5;
    o.x = o.prevX = -19;
    o.y = o.prevY = 8.5;
    // Bearing of the receiver from the passer (rad, the passer faces +x), and the passer's lane.
    const side = seed % 2 ? 1 : -1;
    const [bMin, bMax] = c.bearing ?? [0, 0.9];
    const bearing = side * (bMin + rnd() * (bMax - bMin));
    const lat0 = c.dist * Math.sin(bearing);
    const yLo = Math.max(-6, -7 - lat0);
    const yHi = Math.min(6, 7 - lat0);
    if (yHi < yLo) continue; // the receiver would be outside the rink
    const py = yLo + rnd() * Math.max(0, yHi - yLo);
    const sprint = c.passer === 'sprint';
    const vStart = sprint ? dribbleFor(p, t).sprintSpeedWithBall : 0;
    p.x = p.prevX = (sprint ? -16.5 : -12) + rnd() * 3;
    p.y = p.prevY = py;
    p.heading = p.prevHeading = 0;
    p.vx = vStart;
    p.vy = 0;
    p.stickHist.fill(0);
    p.stickPeak = sprint ? 1 : 0;
    p.wasSprinting = sprint;
    const d = dribbleFor(p, t);
    w.ball.x = w.ball.prevX = p.x + d.stickForward;
    w.ball.y = w.ball.prevY = p.y - d.stickSide;
    pickUp(w.ball, 0, p);
    for (let i = 0; i < (sprint ? RUN_UP : 10); i++) stepWorld(w, [sprint ? cmd(1, 0, { sprint: true }) : cmd()], t);
    if (w.ball.owner !== 0) continue;
    // The receiver: `dist` m away at that bearing; standing (facing the passer, roughly) or running
    // across the line of sight towards the middle of the rink.
    r.x = r.prevX = p.x + Math.cos(bearing) * c.dist;
    r.y = r.prevY = p.y + Math.sin(bearing) * c.dist;
    const toPasser = Math.atan2(p.y - r.y, p.x - r.x);
    if (c.receiver === 'run') {
      let psi = bearing + Math.PI / 2 + (rnd() * 2 - 1) * 0.35;
      if (Math.sin(psi) * r.y > 0) psi = bearing - Math.PI / 2 + (rnd() * 2 - 1) * 0.35;
      r.vx = Math.cos(psi) * RUN_SPEED;
      r.vy = Math.sin(psi) * RUN_SPEED;
      r.heading = r.prevHeading = psi;
    } else {
      r.vx = r.vy = 0;
      r.heading = r.prevHeading = toPasser + (rnd() * 2 - 1) * 0.3;
      rnd();
    }
    // He is a teammate again as the pass leaves (the control switches to him).
    r.bot = true;
    o.x = o.prevX = Math.max(-19, p.x - 6);
    o.y = o.prevY = p.y;
    o.vx = o.vy = 0;
    // The human aims at where he sees the teammate (or ahead of him), with the thumb error.
    const see = Math.atan2(r.y - p.y, r.x - p.x);
    const runSign = c.receiver === 'run' ? Math.sign(-Math.sin(see) * r.vx + Math.cos(see) * r.vy) || 1 : 1;
    const biasSign = c.receiver === 'run' ? -runSign : (seed >> 1) % 2 ? 1 : -1;
    const a = see + runSign * (c.aimAhead ?? 0) + biasSign * (c.aimBias ?? 0) + (rnd() * 2 - 1) * thumb;
    const startPass = w.lastPassTick;
    speeds.push(Math.hypot(p.vx, p.vy));
    stepWorld(w, [cmd(Math.cos(a), Math.sin(a), { pass: true, passHeight: 1, sprint })], t);
    if (w.lastPassTick === startPass) continue;
    valid++;
    if (isCutting(p) || isSkidding(p)) offBalance++;
    const t0 = w.tick;
    // Launch: the launched line against the meet point the assist aimed at.
    const bv = Math.hypot(w.ball.vx, w.ball.vy);
    const ux = w.ball.vx / Math.max(1e-6, bv);
    const uy = w.ball.vy / Math.max(1e-6, bv);
    if (!Number.isNaN(w.meetX)) launch.push(Math.abs(ux * (w.meetY - w.ball.y) - uy * (w.meetX - w.ball.x)));
    aheads.push((((Math.atan2(uy, ux) - see) * runSign) * 180) / Math.PI);
    let best = Infinity;
    let bLat = Number.NaN;
    let bLon = Number.NaN;
    let bH = Number.NaN;
    let touched = false;
    let tracking = true;
    let outcome = -1;
    let high = false;
    const measure = (): number => {
      const b = bladePoint(r, t);
      const dx = w.ball.x - b.x;
      const dy = w.ball.y - b.y;
      const v = Math.hypot(w.ball.vx, w.ball.vy);
      const vx = v > 1e-6 ? w.ball.vx / v : ux;
      const vy = v > 1e-6 ? w.ball.vy / v : uy;
      const dist = Math.hypot(dx, dy);
      if (dist < best || touched) {
        best = dist;
        bLat = Math.abs(vx * dy - vy * dx);
        bLon = vx * dx + vy * dy;
        // Taken: the reception put it on the floor at the stick; its height was the one before.
        bH = (touched ? w.ball.prevZ : w.ball.z) - R;
      }
      return dist;
    };
    // (A function: TypeScript would keep the ball's owner narrowed to the passer.)
    const owner = (): number => w.ball.owner;
    for (let i = 0; i < 240 && owner() !== 1; i++) {
      stepWorld(w, [cmd()], t);
      if (w.lastHighPlayer === 1 && w.lastHighTick >= t0) high = true;
      const received = w.lastReceptionTick === w.tick - 1 && w.lastReceptionPlayer === 1;
      if (received && outcome < 0) {
        outcome = w.lastReceptionOutcome;
        if (tracking) {
          touched = true;
          measure();
          tracking = false;
        }
      } else if (tracking) {
        if (w.passTo !== 1 && w.ball.owner < 0) tracking = false;
        else if (w.ball.owner < 0) measure();
      }
    }
    if (owner() === 1) has++;
    if (outcome === 0) clean++;
    if (high) air++;
    if (Number.isFinite(best)) {
      miss.push(best);
      lat.push(bLat);
      lon.push(Math.abs(bLon));
      heights.push(bH);
    }
  }
  const nn = Math.max(1, valid);
  return {
    n: valid,
    has: (100 * has) / nn,
    clean: (100 * clean) / nn,
    air: (100 * air) / nn,
    missMean: mean(miss),
    missP90: p90(miss),
    latMean: mean(lat),
    latP90: p90(lat),
    lonMean: mean(lon),
    lonP90: p90(lon),
    launchMean: mean(launch),
    launchP90: p90(launch),
    heightMean: mean(heights),
    passerSpeed: mean(speeds),
    offBalance: (100 * offBalance) / nn,
    aheadDeg: mean(aheads),
  };
}

const f2 = (v: number): string => (Number.isNaN(v) ? '  -  ' : v.toFixed(2));

function fmt(s: DriveStats): string {
  return `has ${s.has.toFixed(0).padStart(3)}% clean ${s.clean.toFixed(0).padStart(3)}% air ${s.air.toFixed(0).padStart(3)}% | miss ${f2(s.missMean)} p90 ${f2(s.missP90)} | lat ${f2(s.latMean)} p90 ${f2(s.latP90)} | lon ${f2(s.lonMean)} p90 ${f2(s.lonP90)} | launch ${f2(s.launchMean)} p90 ${f2(s.launchP90)} | h ${f2(s.heightMean)} | v ${s.passerSpeed.toFixed(1)}${s.offBalance > 0 ? ` off-balance ${s.offBalance.toFixed(0)}%` : ''} (n ${s.n})`;
}

/** The same cases pooled over the distances (8-16 m): one line per case. */
function pooled(tuning: Tuning, level: AssistLevel, passer: PasserState, receiver: ReceiverState, n = SEEDS): { all: DriveStats; per: DriveStats[] } {
  const per = DISTS.map((dist) => runDrive(tuning, { level, passer, receiver, dist, n }));
  const w = (k: keyof DriveStats): number => per.reduce((acc, s) => acc + (s[k] as number) * s.n, 0) / Math.max(1, per.reduce((acc, s) => acc + s.n, 0));
  const all: DriveStats = {
    n: per.reduce((acc, s) => acc + s.n, 0),
    has: w('has'),
    clean: w('clean'),
    air: w('air'),
    missMean: w('missMean'),
    missP90: w('missP90'),
    latMean: w('latMean'),
    latP90: w('latP90'),
    lonMean: w('lonMean'),
    lonP90: w('lonP90'),
    launchMean: w('launchMean'),
    launchP90: w('launchP90'),
    heightMean: w('heightMean'),
    passerSpeed: w('passerSpeed'),
    offBalance: w('offBalance'),
    aheadDeg: w('aheadDeg'),
  };
  return { all, per };
}

const BASE = (): Tuning => structuredClone(TUNING);

run('driven pass aim bench (alt fort, tap, 8-16 m)', () => {
  it('driven pass (tap): miss at the blade and has / clean, by assist level, passer and receiver state, distance', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const passer of ['still', 'sprint'] as const) {
      for (const receiver of ['still', 'run'] as const) {
        for (const level of ['light', 'medium', 'strong'] as const) {
          const { all, per } = pooled(t, level, passer, receiver);
          for (let i = 0; i < DISTS.length; i++) console.log(`DRIVE ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${level.padEnd(6)} ${String(DISTS[i]).padStart(2)} m | ${fmt(per[i]!)}`);
          console.log(`DRIVE ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${level.padEnd(6)} 8-16 | ${fmt(all)}`);
        }
      }
    }
  });

  it('error budget (medium, 12 and 16 m, standing and at a sprint): which error term dominates', { timeout: 3600000 }, () => {
    const variants: [string, (t: Tuning) => void, number][] = [
      ['factory', () => {}, THUMB],
      ['no thumb error', () => {}, 0],
      ['errorSprint 0', (t) => (t.pass.errorSprint = 0), THUMB],
      ['drive error ×1', (t) => (t.pass.driveErrorFactor = 1), THUMB],
      ['drive error ×1.5', (t) => (t.pass.driveErrorFactor = 1.5), THUMB],
      ['errorBase 0', (t) => (t.pass.errorBase = 0), THUMB],
      ['no pass error', (t) => (t.pass.errorBase = t.pass.errorSprint = 0), THUMB],
      ['errorPower 0', (t) => (t.pass.errorPower = 0), THUMB],
      ['all errors 0', (t) => (t.pass.errorBase = t.pass.errorSprint = t.pass.errorPower = 0), 0],
      ['thumb ±0.25', () => {}, 0.25],
    ];
    for (const passer of ['still', 'sprint'] as const) {
      for (const receiver of ['still', 'run'] as const) {
        for (const dist of [12, 16]) {
          for (const [name, mod, thumb] of variants) {
            const t = BASE();
            mod(t);
            console.log(`BUDGET ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${dist} m ${name.padEnd(15)} | ${fmt(runDrive(t, { level: 'medium', passer, receiver, dist, thumb }))}`);
          }
        }
      }
    }
  });

  it('aiming freedom: aiming ahead of a runner still sends the driven pass ahead (medium / light)', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const level of ['light', 'medium', 'strong'] as const) {
      for (const ahead of [0, 0.35, 0.5]) {
        for (const passer of ['still', 'sprint'] as const) {
          const s = runDrive(t, { level, passer, receiver: 'run', dist: 12, aimAhead: ahead });
          console.log(`FREEDOM ${level.padEnd(6)} aim ${((ahead * 180) / Math.PI).toFixed(0).padStart(2)}° ahead ${passer.padEnd(6)} | launched ${s.aheadDeg.toFixed(1)}° ahead of him | ${fmt(s)}`);
        }
      }
    }
  });

  it('wide angle (54-80° off the skating direction): at a sprint the stick turned to aim is a trencada', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const passer of ['still', 'sprint'] as const) {
      for (const level of ['medium', 'strong'] as const) {
        for (const dist of [8, 10, 12]) {
          const s = runDrive(t, { level, passer, receiver: 'still', dist, bearing: [0.95, 1.4] });
          console.log(`WIDE ${passer.padEnd(6)} ${level.padEnd(6)} ${String(dist).padStart(2)} m | ${fmt(s)}`);
        }
      }
    }
  });

  it('how much Forta helps over Mitjana: thumb ±0.12 / ±0.25 and a sloppier aim (10°, 20°, 30° off), 8-16 m pooled', { timeout: 3600000 }, () => {
    const t = BASE();
    for (const passer of ['still', 'sprint'] as const) {
      for (const receiver of ['still', 'run'] as const) {
        for (const [name, thumb, bias] of [['±0.12', THUMB, 0], ['±0.25', 0.25, 0], ['10° off', THUMB, 0.1745], ['20° off', THUMB, 0.349], ['30° off', THUMB, 0.5236]] as const) {
          for (const level of ['medium', 'strong'] as const) {
            const per = DISTS.map((dist) => runDrive(t, { level, passer, receiver, dist, thumb, aimBias: bias }));
            const nn = per.reduce((a, s) => a + s.n, 0);
            const avg = (k: keyof DriveStats): number => per.reduce((a, s) => a + (s[k] as number) * s.n, 0) / Math.max(1, nn);
            console.log(`FORTA ${passer.padEnd(6)} -> ${receiver.padEnd(5)} ${name.padEnd(7)} ${level.padEnd(6)} | has ${avg('has').toFixed(0)}% clean ${avg('clean').toFixed(0)}% | miss ${f2(avg('missMean'))} p90 ${f2(avg('missP90'))} lat ${f2(avg('latMean'))} p90 ${f2(avg('latP90'))} | launch ${f2(avg('launchMean'))} p90 ${f2(avg('launchP90'))} (n ${nn})`);
          }
        }
      }
    }
  });

  it('sweep (v0.1.29): driven-only error factor x Mitjana driven correction, vs Forta, 8-16 m pooled', { timeout: 3600000 }, () => {
    const configs: [string, AssistLevel, number, number][] = [];
    for (const ef of [1.5, 1.25, 1]) {
      configs.push([`Forta  ef ${ef.toFixed(2)}`, 'strong', ef, 1]);
      for (const corr of [0.85, 0.95, 1]) configs.push([`Mitjana ef ${ef.toFixed(2)} corr ${corr.toFixed(2)}`, 'medium', ef, corr]);
    }
    for (const [name, level, ef, corr] of configs) {
      const t = BASE();
      t.pass.driveErrorFactor = ef;
      t.pass.driveMediumCorrection = corr;
      const cols: string[] = [];
      for (const [aim, bias] of [['±0.12', 0], ['20° off', 0.349]] as const) {
        for (const passer of ['still', 'sprint'] as const) {
          for (const receiver of ['still', 'run'] as const) {
            const per = DISTS.map((dist) => runDrive(t, { level, passer, receiver, dist, aimBias: bias }));
            const nn = per.reduce((a, s) => a + s.n, 0);
            const avg = (k: keyof DriveStats): number => per.reduce((a, s) => a + (s[k] as number) * s.n, 0) / Math.max(1, nn);
            cols.push(`${aim} ${passer}->${receiver} ${avg('has').toFixed(0)}/${avg('clean').toFixed(0)} L ${f2(avg('launchMean'))}/${f2(avg('launchP90'))} M ${f2(avg('missMean'))}`);
          }
        }
      }
      console.log(`SWEEP ${name.padEnd(26)} | ${cols.join(' | ')}`);
    }
  });
});
