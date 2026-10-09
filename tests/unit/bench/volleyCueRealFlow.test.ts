import { describe, it } from 'vitest';
import { goalLineX } from '../../../src/config/rink';
import { TUNING, type Tuning } from '../../../src/config/tuning';
import { FixedStepLoop } from '../../../src/game/fixedStepLoop';
import { SlowMo } from '../../../src/game/slowMo';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { pickUp } from '../../../src/sim/dribble';
import { dribbleFor } from '../../../src/sim/feel';
import { createWorld, stepWorld, type WorldState } from '../../../src/sim/world';

// Diagnosis bench of the v0.1.28 report ("no he visto ni la cámara lenta ni el aviso", v0.1.29):
// the REAL flow, emulating src/game/game.ts frame by frame: the human (commands[0]) carries the
// ball, holds PASE with the driven-lofted height (passHeight 1) aimed at a teammate, releases;
// the pass leaves, control switches; then the human releases the stick / aims at the goal / taps
// TIR reacting to the cue. Per frame: SlowMo.update(world, 1/60, TUNING.slowMo) BEFORE
// loop.advance (as game.ts), then the HUD test of main.ts (volley.open && ball.owner < 0).
//   PATINS_BENCH=1 npx vitest run tests/unit/bench/volleyCueRealFlow
const run = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PATINS_BENCH ? describe : describe.skip;

const GX = goalLineX(1);
type Passer = 'stand' | 'skate' | 'sprint';
type Receiver = 'still' | 'moving';
type After = 'release' | 'goal' | 'goalSoft' | 'cueTap';

interface Case {
  d: number;
  passer: Passer;
  receiver: Receiver;
  after: After;
  angleDeg: number;
  speed: number;
  /** Display refresh (Hz): frames of real time. */
  hz?: number;
  tuning?: Tuning;
}

interface Result {
  dRelease: number;
  air: number;
  switched: boolean;
  found: boolean;
  /** HUD cue lit (frames, real ms), volley.time at the first lit frame. */
  cueFrames: number;
  cueMs: number;
  firstOpenTime: number;
  slow: boolean;
  slowAt: number;
  /** Game seconds that ran during the slow-mo, real seconds it lasted, ball travel during it (m). */
  slowGame: number;
  slowReal: number;
  slowBallMove: number;
  slowBallSpeed: number;
  /** Min volley.time sampled by SlowMo.update with found && contactTick < 0 (s). */
  minTime: number;
  contactH: number;
  outcome: string;
  /** Ball height above the floor at the reception / strike tick (m). */
  ballH: number;
  /** Why no window: 'nopasses' (never within reach), 'height' (passes but not 0.15-1.5), 'early' (taken before), '' */
  why: string;
  /** Max ball height in flight. */
  apex: number;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const R = 0.0365;

function runCase(c: Case, seed: number): Result {
  const t = c.tuning ?? TUNING;
  const hz = c.hz ?? 60;
  const rnd = lcg(seed * 977 + c.d * 13 + c.angleDeg);
  const w: WorldState = createWorld(seed, 2);
  w.assist = 'medium';
  const passer = w.players[0]!;
  const rec = w.players[1]!;
  const other = w.players[2]!;
  const runSpeed = c.passer === 'stand' ? 0 : c.passer === 'skate' ? 0.75 : 1;
  const sprint = c.passer === 'sprint';
  const x0 = -13 + rnd();
  const y0 = -4 + rnd();
  passer.x = passer.prevX = x0;
  passer.y = passer.prevY = y0;
  passer.heading = passer.prevHeading = 0;
  const v0 = c.passer === 'stand' ? 0 : c.passer === 'skate' ? 6.3 : 9.3;
  passer.vx = v0;
  passer.vy = 0;
  const dr = dribbleFor(passer, t);
  w.ball.x = w.ball.prevX = x0 + dr.stickForward;
  w.ball.y = w.ball.prevY = y0 - dr.stickSide;
  pickUp(w.ball, 0, passer);
  w.controlled = 0;
  other.x = other.prevX = -16;
  other.y = other.prevY = 7;
  // Receiver far away until the press.
  rec.x = rec.prevX = 10;
  rec.y = rec.prevY = 8;
  const a = ((c.angleDeg + (rnd() * 2 - 1) * 5) * Math.PI) / 180;
  const holdFrames = Math.round(0.25 * hz);
  const runFrames = Math.round(0.33 * hz);
  const pressFrame = runFrames;
  const releaseFrame = pressFrame + holdFrames;
  const thumb = (rnd() * 2 - 1) * 0.12;
  const moveDir = a + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2;

  const loop = new FixedStepLoop(t.sim.tickRate, t.sim.maxStepsPerFrame);
  const slow = new SlowMo();
  const cmd: PlayerCommand = emptyCommand();
  const res: Result = {
    dRelease: Number.NaN, air: 0, switched: false, found: false, cueFrames: 0, cueMs: 0, firstOpenTime: Number.NaN,
    slow: false, slowAt: Number.NaN, slowGame: 0, slowReal: 0, slowBallMove: 0, slowBallSpeed: Number.NaN, minTime: Number.NaN, contactH: Number.NaN,
    outcome: 'untouched', ballH: Number.NaN, why: '', apex: 0,
  };
  let passed = false;
  let passTick = -1;
  let firstCueFrame = -1;
  let tirPress = -1;
  let passesEver = false;
  let prevZ = R;
  let done = false;
  let slowBallStart: { x: number; y: number } | null = null;
  const shotTick0 = w.lastShotTick;
  for (let f = 0; f < 6 * hz && (!done || slow.scale < 1); f++) {
    // Human input this frame.
    cmd.moveX = cmd.moveY = 0;
    cmd.sprint = false;
    cmd.passHeld = false;
    cmd.shootHeld = false;
    if (!passed) {
      const dir = f < pressFrame ? 0 : a + thumb;
      if (c.passer !== 'stand') {
        cmd.moveX = Math.cos(dir) * runSpeed;
        cmd.moveY = Math.sin(dir) * runSpeed;
        cmd.sprint = sprint;
      } else if (f >= pressFrame) {
        cmd.moveX = Math.cos(dir) * 0.06; // aims without (much) skating: under the dead zone it'd be heading
        cmd.moveY = Math.sin(dir) * 0.06;
      }
      if (f === pressFrame) {
        cmd.pass = true;
        // Place the receiver d m from where the passer will be at the release.
        const lead = (holdFrames / hz) * Math.hypot(passer.vx, passer.vy);
        const px = passer.x + Math.cos(Math.atan2(passer.vy, passer.vx) || 0) * lead;
        const py = passer.y + Math.sin(Math.atan2(passer.vy, passer.vx) || 0) * lead;
        rec.x = rec.prevX = px + Math.cos(a) * c.d;
        rec.y = rec.prevY = Math.max(-9, Math.min(9, py + Math.sin(a) * c.d));
        rec.heading = rec.prevHeading = c.receiver === 'moving' ? moveDir : a + Math.PI;
        rec.vx = rec.vy = 0;
      }
      if (f >= pressFrame) {
        cmd.passHeld = f < releaseFrame;
        cmd.passHeight = 1;
      }
    } else if (passed) {
      const p = w.players[w.controlled]!;
      if (c.after === 'goal' || c.after === 'goalSoft') {
        const g = Math.atan2(-p.y, GX - p.x);
        const m = c.after === 'goal' ? 0.7 : 0.3;
        cmd.moveX = Math.cos(g) * m;
        cmd.moveY = Math.sin(g) * m;
      }
      if (c.after === 'cueTap' && tirPress >= 0 && f >= tirPress && f < tirPress + Math.round(0.1 * hz)) {
        cmd.shoot = f === tirPress;
        cmd.shootHeld = f < tirPress + Math.round(0.1 * hz) - 1;
      }
    }
    if (c.receiver === 'moving' && f >= pressFrame && !passed) {
      rec.vx = Math.cos(moveDir) * 4.5;
      rec.vy = Math.sin(moveDir) * 4.5;
      rec.heading = moveDir;
    }
    // game.ts frame
    const v = w.volley;
    if (passed && w.ball.owner < 0 && v.found && v.contactTick < 0) {
      res.minTime = Number.isNaN(res.minTime) ? v.time : Math.min(res.minTime, v.time);
      res.contactH = v.height;
    }
    const wasSlow = slow.scale < 1 || false;
    const scale = slow.update(w, 1 / hz, t.slowMo);
    if (!res.slow && scale < 1) {
      res.slow = true;
      res.slowAt = v.time;
      slowBallStart = { x: w.ball.x, y: w.ball.y };
      res.slowBallSpeed = Math.hypot(w.ball.vx, w.ball.vy, w.ball.vz);
    }
    if (res.slow && scale < 1) res.slowReal += 1 / hz;
    void wasSlow;
    const gs = (1 / hz) * Math.min(2, Math.max(0.5, c.speed)) * scale;
    if (res.slow && scale < 1) res.slowGame += gs;
    loop.advance(gs, () => {
      prevZ = w.ball.z;
      const ownerBefore = w.ball.owner;
      stepWorld(w, [cmd], t);
      if (cmd.pass || cmd.shoot) cmd.pass = cmd.shoot = false;
      if (!passed && ownerBefore === 0 && w.ball.owner < 0) {
        passed = true;
        passTick = w.tick;
        res.dRelease = Math.hypot(rec.x - passer.x, rec.y - passer.y);
        res.air = w.passAir;
        res.switched = w.controlled === 1;
      }
      if (passed && w.ball.owner < 0) res.apex = Math.max(res.apex, w.ball.z - R);
      if (passed && w.controlled === 1 && w.volley.found) res.found = true;
      if (passed && w.volley.incoming) passesEver = true;
      if (passed && !done) {
        if (w.lastShotTick !== shotTick0 && w.lastShotPlayer === 1) {
          res.outcome = w.lastShot.aerial ? 'volley' : 'shot1st';
          res.ballH = (w.lastShot.contactHeight ?? prevZ - R);
          done = true;
        } else if (w.lastReceptionTick === w.tick - 1 && w.lastReceptionTick >= passTick && res.outcome === 'untouched') {
          const o = w.lastReceptionOutcome;
          const high = w.lastHighPlayer === 1 && w.lastHighTick === w.tick - 1;
          res.outcome = (high ? 'high-' : 'low-') + ['clean', 'heavy', 'rebound', 'miss'][o];
          res.ballH = prevZ - R;
          if (w.lastReceptionPlayer !== 1) res.outcome = 'other-' + res.outcome;
          if (o <= 1 && res.outcome.indexOf('other') < 0 && c.after !== 'cueTap') done = true;
        }
      }
    });
    if (slowBallStart && slow.scale >= 1 && res.slowBallMove === 0 && res.slow) {
      res.slowBallMove = Math.hypot(w.ball.x - slowBallStart.x, w.ball.y - slowBallStart.y);
    }
    // main.ts onFrame HUD
    const on = w.volley.open && w.ball.owner < 0;
    if (on) {
      res.cueFrames++;
      if (firstCueFrame < 0) {
        firstCueFrame = f;
        res.firstOpenTime = w.volley.time;
        if (c.after === 'cueTap') tirPress = f + Math.round(0.22 * hz); // human visual reaction ~0.22 s
      }
    }
    if (passed && w.tick - passTick > 200) done = true;
    if (passed && w.ball.owner === 1 && c.after === 'cueTap' && (tirPress < 0 || f > tirPress + 30)) done = true;
  }
  res.cueMs = (res.cueFrames / hz) * 1000;
  if (!res.found) res.why = passesEver ? 'height' : 'nopasses';
  return res;
}

const pct = (n: number, d: number): string => `${d ? Math.round((100 * n) / d) : 0}`.padStart(3) + '%';
const avg = (a: number[]): string => {
  const b = a.filter((x) => Number.isFinite(x));
  return b.length ? (b.reduce((x, y) => x + y, 0) / b.length).toFixed(2) : '  - ';
};

function summary(label: string, rs: Result[]): string {
  const n = rs.length;
  const outc: Record<string, number> = {};
  for (const r of rs) outc[r.outcome] = (outc[r.outcome] ?? 0) + 1;
  const why: Record<string, number> = {};
  for (const r of rs) if (r.why) why[r.why] = (why[r.why] ?? 0) + 1;
  return `${label} | dRel ${avg(rs.map((r) => r.dRelease))} air ${avg(rs.map((r) => r.air))} | switch ${pct(rs.filter((r) => r.switched).length, n)} found ${pct(rs.filter((r) => r.found).length, n)} cue ${pct(rs.filter((r) => r.cueFrames > 0).length, n)} (${avg(rs.filter((r) => r.cueFrames > 0).map((r) => r.cueMs))} ms, opens at ${avg(rs.map((r) => r.firstOpenTime))} s) slow ${pct(rs.filter((r) => r.slow).length, n)} (at ${avg(rs.map((r) => r.slowAt))} s; game ${avg(rs.filter((r) => r.slow).map((r) => r.slowGame))} s in real ${avg(rs.filter((r) => r.slow).map((r) => r.slowReal))} s; ball ${avg(rs.filter((r) => r.slow).map((r) => r.slowBallMove))} m at ${avg(rs.map((r) => r.slowBallSpeed))} m/s) | minT ${avg(rs.map((r) => r.minTime))} hC ${avg(rs.map((r) => r.contactH))} apex ${avg(rs.map((r) => r.apex))} ballH ${avg(rs.map((r) => r.ballH))} | ${JSON.stringify(outc)} ${Object.keys(why).length ? 'nowin:' + JSON.stringify(why) : ''}`;
}

const SEEDS = 12;
const DISTS = [6, 8, 10, 12, 14, 16, 18, 20];

run('real flow: driven lofted pass → volley window / cue / slow-mo (bug report v0.1.28)', () => {
  it('speed 1, 60 Hz: all cases', { timeout: 600000 }, () => {
    for (const after of ['release', 'goal', 'goalSoft'] as After[]) {
      for (const passer of ['stand', 'skate', 'sprint'] as Passer[]) {
        for (const receiver of ['still', 'moving'] as Receiver[]) {
          for (const d of DISTS) {
            const rs: Result[] = [];
            for (const angleDeg of [0, 35]) for (let s = 1; s <= SEEDS; s++) rs.push(runCase({ d, passer, receiver, after, angleDeg, speed: 1 }, s));
            console.log(summary(`${after.padEnd(7)} ${passer.padEnd(6)} ${receiver.padEnd(6)} ${String(d).padStart(2)} m`, rs));
          }
        }
      }
    }
  });
  it('cue-reactive TIR tap (0.22 s reaction to the lit button)', { timeout: 600000 }, () => {
    for (const passer of ['stand', 'sprint'] as Passer[]) {
      for (const d of DISTS) {
        const rs: Result[] = [];
        for (const angleDeg of [0, 35]) for (let s = 1; s <= SEEDS; s++) rs.push(runCase({ d, passer, receiver: 'still', after: 'cueTap', angleDeg, speed: 1 }, s));
        console.log(summary(`cueTap  ${passer.padEnd(6)} still  ${String(d).padStart(2)} m`, rs));
      }
    }
  });
  it('game speed 0.8 / 1.4 and 120 Hz display', { timeout: 600000 }, () => {
    for (const [speed, hz] of [[0.8, 60], [1.4, 60], [1, 120], [1.4, 120]] as [number, number][]) {
      for (const passer of ['stand', 'sprint'] as Passer[]) {
        for (const d of [8, 12, 16, 18]) {
          const rs: Result[] = [];
          for (const after of ['release', 'goal'] as After[]) for (const angleDeg of [0, 35]) for (let s = 1; s <= SEEDS; s++) rs.push(runCase({ d, passer, receiver: 'still', after, angleDeg, speed, hz }, s));
          console.log(summary(`speed ${speed} ${hz}Hz ${passer.padEnd(6)} ${String(d).padStart(2)} m`, rs));
        }
      }
    }
  });
  it('split by pass angle, stick to the goal after the pass: 0 vs 35 deg', { timeout: 600000 }, () => {
    for (const angleDeg of [0, 35]) {
      for (const passer of ['stand', 'sprint'] as Passer[]) {
        for (const d of [8, 12, 16]) {
          const rs: Result[] = [];
          for (let s = 1; s <= 24; s++) rs.push(runCase({ d, passer, receiver: 'still', after: 'goal', angleDeg, speed: 1 }, s));
          console.log(summary(`goal ang ${angleDeg} ${passer.padEnd(6)} ${String(d).padStart(2)} m`, rs));
        }
      }
    }
  });
});
