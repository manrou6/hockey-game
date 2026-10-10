import { afterEach, describe, expect, it, vi } from 'vitest';
import { TUNING } from '../../../src/config/tuning';
import { Game, type CommandSource } from '../../../src/game/game';
import { gameSeconds } from '../../../src/game/gameSpeed';
import type { Renderer } from '../../../src/render/renderer';
import { emptyCommand, type PlayerCommand } from '../../../src/sim/commands';
import { createWorld, stepWorld, type WorldState } from '../../../src/sim/world';
import { TUNING_PARAMS } from '../../../src/config/tuningMeta';
import {
  ASSISTS,
  coreState,
  createPolicy,
  diffPaths,
  fire,
  frameTime,
  Lcg,
  policyStep,
  replay,
  Report,
  reproCageModels,
  reproDrivenPass,
  reproHoldAtBoard,
  reproOutRespawnInGoal,
  reproScratchLeak,
  reproSwitchDuringHold,
  setupFor,
  stressGame,
  sweepCases,
  tuningAtExtreme,
  tuningRandom,
  worldHash,
  type FrameProfile,
  type GameSetup,
  type Policy,
} from './stressBench';

// Stress bench (docs/audit/B.md §B). Prints its numbers; asserts only what must always hold
// (determinism, the loop's time accounting). Run all of it with
//   PATINS_BENCH=1 npx vitest run tests/unit/bench/stressBench --maxWorkers=1
// or one part with -t "B1" … "B6". Sizes (defaults in brackets):
//   PATINS_STRESS_GAMES [2000] games of PATINS_STRESS_SECONDS [20] s (B1, seeds 1..GAMES),
//   PATINS_STRESS_LOOP_GAMES [8] games per speed × frame profile (B4).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const run = env.PATINS_BENCH ? describe : describe.skip;
const num = (k: string, d: number): number => (env[k] ? Number(env[k]) : d);

const GAMES = num('PATINS_STRESS_GAMES', 2000);
const SECONDS = num('PATINS_STRESS_SECONDS', 20);
const LOOP_GAMES = num('PATINS_STRESS_LOOP_GAMES', 8);
const HOUR = 3600000;

const ms = (t0: number): string => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

run('stress bench (§B)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('B1 random games at the tick level: every tick checked', { timeout: HOUR }, () => {
    const t0 = Date.now();
    const rep = new Report();
    const variants = new Map<string, number>();
    for (let seed = 1; seed <= GAMES; seed++) {
      const s = setupFor(seed);
      variants.set(s.variant, (variants.get(s.variant) ?? 0) + 1);
      stressGame(s, SECONDS, rep);
    }
    console.log(rep.format(`B1 seeds 1..${GAMES} × ${SECONDS} s, variants ${[...variants].map(([k, v]) => `${k} ${v}`).join(', ')}`));
    console.log(`B1 runtime ${ms(t0)}`);
  });

  it('B5 tuning fuzz: every panel value at its min and at its max (one at a time), then all random', { timeout: HOUR }, () => {
    const t0 = Date.now();
    const seconds = Math.min(SECONDS, 10);
    const one = new Report();
    const byParam = new Map<string, string[]>();
    let seed = 30000;
    for (const m of TUNING_PARAMS) {
      if (m.path === 'game.speed') continue;
      for (const end of ['min', 'max'] as const) {
        const before = new Map(one.counts);
        const s: GameSetup = { seed: seed++, mates: 2, assist: ASSISTS[seed % 4]!, tuning: tuningAtExtreme(m.path, end), variant: `${m.path}=${end}` };
        stressGame(s, seconds, one, false);
        for (const [k, v] of one.counts) {
          if (v !== (before.get(k) ?? 0)) byParam.set(`${m.path}=${end}`, [...(byParam.get(`${m.path}=${end}`) ?? []), `${k}+${v - (before.get(k) ?? 0)} (seed ${s.seed})`]);
        }
      }
    }
    console.log(one.format(`B5a one panel value at an end, seeds 30000..${seed - 1} × ${seconds} s`));
    console.log(`B5a settings with issues: ${[...byParam].map(([k, v]) => `\n   ${k}: ${v.join(', ')}`).join('') || 'none'}`);
    const all = new Report();
    const r = new Lcg(31337);
    for (let g = 0; g < 200; g++) {
      const s: GameSetup = { seed: 40000 + g, mates: 2, assist: ASSISTS[g % 4]!, tuning: tuningRandom(r), variant: 'fuzz' };
      stressGame(s, seconds, all, false);
    }
    console.log(all.format(`B5b every panel value random (Lcg 31337, in order), seeds 40000..40199 × ${seconds} s`));
    console.log(`B5 runtime ${ms(t0)}`);
  });

  it('B6 targeted reproductions of the findings', { timeout: HOUR }, () => {
    const f1 = reproSwitchDuringHold();
    console.log(`B6 F1 CANVI during the late-release hold: ball moved ${f1.jump.toFixed(2)} m in one tick (control ${f1.from}→${f1.to}); same tick without CANVI ${f1.jumpWithoutSwitch.toFixed(2)} m`);
    for (const h of [0.3, 1.2]) {
      const f2 = reproHoldAtBoard(h);
      console.log(`B6 F2 late-release hold facing a side board, hold height ${h} m: ball centre up to ${f2.beyond.toFixed(3)} m beyond the board line; declared out: ${f2.out}`);
    }
    const f3 = reproOutRespawnInGoal();
    console.log(`B6 F3 out while the controlled player faces the goal from 0.8 m: put back at ${f3.x.toFixed(2)},${f3.y.toFixed(2)} (inside the cage: ${f3.insideCage}), thrown ${f3.nextJump.toFixed(2)} m on the next tick`);
    const f4 = reproScratchLeak();
    console.log(`B6 F4 shared scratch: quiet world's volley.time ${f4.quiet.toFixed(3)} → ${f4.afterOther.toFixed(3)} after another world computed a contact in ${f4.otherTime.toFixed(3)} s`);
    const f5 = reproCageModels();
    console.log(`B6 F5 two cage models: ball carried against the back of the net ends ${(f5.carriedBoxPen * 100).toFixed(1)} cm inside the ball physics' cage; let go there it pops ${(f5.popOnRelease * 100).toFixed(1)} cm`);
    for (const dist of [10, 14, 16, 17, 18, 20]) {
      const g = reproDrivenPass(dist, 'goal');
      const r = reproDrivenPass(dist, 'released');
      console.log(`B6 F6 driven pass ${dist} m (passAir ${g.passAir.toFixed(2)}): stick at the goal → received ${g.received}, touched ${g.touched}, closest to his blade ${g.closest.toFixed(2)} m | stick released → received ${r.received}, closest ${r.closest.toFixed(2)} m`);
    }
  });

  it('B2 tunnelling sweep at 28, 29, 30 and 37 m/s (ball physics only, players for the squeezes)', { timeout: HOUR }, () => {
    const t0 = Date.now();
    const rep = new Report();
    const tuning = structuredClone(TUNING);
    const cases = sweepCases([28, 29, 30, 37]);
    cases.forEach((c, i) => fire(c, tuning, 9000 + i, rep));
    const heavy = structuredClone(TUNING);
    heavy.ball.heavy = 1;
    const repHeavy = new Report();
    sweepCases([30], 777, 0.5).forEach((c, i) => fire(c, heavy, 5000 + i, repHeavy));
    console.log(rep.format(`B2 sweep, ${cases.length} shots (case i uses board-jitter rng seed 9000 + i)`));
    console.log(repHeavy.format('B2 sweep, heavy ball at 30 m/s (lcg 777, rng seed 5000 + i)'));
    console.log(`B2 runtime ${ms(t0)}`);
  });

  it('B3 determinism: twice, replayed, interleaved with another world, snapshot + continue', { timeout: HOUR }, () => {
    const t0 = Date.now();
    const seeds = Array.from({ length: 60 }, (_, i) => 101 + i);
    let interleavedFull = 0;
    let interleavedCore = 0;
    let snapFull = 0;
    let snapCore = 0;
    const diffs = new Map<string, number>();
    const note = (paths: string[]): void => {
      for (const p of paths) {
        const k = p.replace(/\[\d+\]/g, '[i]').replace(/:.*$/, '');
        diffs.set(k, (diffs.get(k) ?? 0) + 1);
      }
    };
    for (const seed of seeds) {
      const s = setupFor(seed);
      const cmds: PlayerCommand[] = [];
      const a = stressGame(s, SECONDS, new Report(), false, cmds);
      const b = stressGame(s, SECONDS, new Report(), false);
      const c = replay(s, cmds);
      expect(worldHash(b), `seed ${seed}: run twice`).toBe(worldHash(a));
      expect(worldHash(c), `seed ${seed}: replayed`).toBe(worldHash(a));
      // Interleaved tick by tick with another world (other seed, other inputs).
      const other = setupFor(seed + 5000);
      const oc: PlayerCommand[] = [];
      stressGame(other, SECONDS, new Report(), false, oc);
      const wa = createWorld(s.seed, s.mates);
      wa.assist = s.assist;
      const wo = createWorld(other.seed, other.mates);
      wo.assist = other.assist;
      for (let i = 0; i < cmds.length; i++) {
        stepWorld(wa, [cmds[i]!], s.tuning);
        stepWorld(wo, [oc[i]!], other.tuning);
      }
      if (worldHash(coreState(wa)) !== worldHash(coreState(a))) interleavedCore++;
      if (worldHash(wa) !== worldHash(a)) {
        interleavedFull++;
        note(diffPaths(a, wa));
      }
      // Snapshot (structuredClone) half-way, another world runs, then continue the snapshot.
      const half = Math.floor(cmds.length / 2);
      const w = createWorld(s.seed, s.mates);
      w.assist = s.assist;
      for (let i = 0; i < half; i++) stepWorld(w, [cmds[i]!], s.tuning);
      const snap = structuredClone(w);
      const wo2 = createWorld(other.seed, other.mates);
      for (let i = 0; i < 300; i++) stepWorld(wo2, [oc[i]!], other.tuning);
      for (let i = half; i < cmds.length; i++) stepWorld(snap, [cmds[i]!], s.tuning);
      if (worldHash(coreState(snap)) !== worldHash(coreState(a))) snapCore++;
      if (worldHash(snap) !== worldHash(a)) {
        snapFull++;
        note(diffPaths(a, snap));
      }
    }
    console.log(`B3 ${seeds.length} seeds (${seeds[0]}..${seeds[seeds.length - 1]}) × ${SECONDS} s: run twice / replayed identical in all`);
    console.log(`B3 interleaved: core state differs in ${interleavedCore}, full world differs in ${interleavedFull}`);
    console.log(`B3 snapshot + other world + continue: core state differs in ${snapCore}, full world differs in ${snapFull}`);
    console.log(`B3 differing fields (count over all runs): ${[...diffs].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    console.log(`B3 runtime ${ms(t0)}`);
    expect(interleavedCore).toBe(0);
    expect(snapCore).toBe(0);
  });

  it('B4 the real game loop (src/game/game.ts) headless: game speed 0.8/1.0/1.4 × 30/60/144 Hz and hitches, with the volley slow-mo', { timeout: HOUR }, () => {
    const t0 = Date.now();
    const fake = { engine: { runRenderLoop: () => undefined }, sync: () => undefined, render: () => undefined } as unknown as Renderer;
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const speed0 = TUNING.game.speed;
    const rep = new Report();
    const lines: string[] = [];
    try {
      for (const speed of [0.8, 1, 1.4]) {
        for (const profile of ['f30', 'f60', 'f144', 'hitch'] as FrameProfile[]) {
          TUNING.game.speed = speed;
          let ticks = 0;
          let frames = 0;
          let requested = 0;
          let dropped = 0;
          let accountingErr = 0;
          let maxSteps = 0;
          let slowFrames = 0;
          let slowReal = 0;
          let slowStarts = 0;
          let slowTicks = 0;
          let slowGame = 0;
          let mismatch = 0;
          let speedDependent = 0;
          for (let g = 0; g < LOOP_GAMES; g++) {
            const seed = 20000 + g;
            const fps = profile === 'f30' ? 30 : profile === 'f144' ? 144 : 60;
            const pol = createPolicy(seed * 31 + 7, fps / speed);
            const src = new PolicySource(pol);
            const game = new Game(fake, src, seed);
            src.world = game.world;
            const loop = game.loop as unknown as { accumulator: number };
            const recorded: PlayerCommand[] = [];
            const fr = new Lcg(seed);
            let real = 0;
            let wasSlow = false;
            clock += 16;
            let first = true;
            while (real < SECONDS) {
              // game.ts takes its very first frame as 1/60 s, whatever the clock says.
              const dt = first ? 1 / 60 : frameTime(profile, fr);
              first = false;
              real += dt;
              clock += dt * 1000;
              const before = loop.accumulator;
              (game as unknown as { frame(): void }).frame();
              frames++;
              const steps = game.loop.lastSteps;
              const scale = game.slowMo.scale;
              const want = gameSeconds(dt, speed) * scale;
              const step = game.loop.stepSeconds;
              const clampLoss = Math.max(0, before + want - step * TUNING.sim.maxStepsPerFrame);
              const loss = before + want - steps * step - loop.accumulator;
              accountingErr = Math.max(accountingErr, Math.abs(loss - clampLoss));
              requested += want;
              dropped += clampLoss;
              ticks += steps;
              maxSteps = Math.max(maxSteps, steps);
              if (scale < 1) {
                slowFrames++;
                slowReal += Math.min(dt, 0.1);
                slowTicks += steps;
                slowGame += want;
                if (!wasSlow) slowStarts++;
              }
              wasSlow = scale < 1;
              // The commands each tick of this frame got (game.ts: presses only on the first tick).
              const c = src.last;
              for (let k = 0; k < steps; k++) {
                const edges = k > 0 && (c.pass || c.shoot || c.dribble || c.switchPlayer);
                recorded.push(edges ? { ...c, pass: false, shoot: false, dribble: false, switchPlayer: false } : { ...c });
              }
            }
            const setup: GameSetup = { seed, mates: 2, assist: 'medium', tuning: TUNING, variant: 'loop' };
            const r = replay(setup, recorded, rep);
            if (worldHash(r) !== worldHash(game.world) || r.tick !== recorded.length) mismatch++;
            // The same ticks with other game speed / slow-mo settings: the sim must not read them.
            const other = structuredClone(TUNING);
            other.game.speed = speed === 1 ? 1.4 : 1;
            other.slowMo.enabled = 0;
            other.slowMo.scale = 0.2;
            if (worldHash(replay({ ...setup, tuning: other }, recorded)) !== worldHash(r)) speedDependent++;
          }
          lines.push(
            `B4 speed ${speed} ${profile.padEnd(5)}: ${LOOP_GAMES} games (seeds 20000..${20000 + LOOP_GAMES - 1}) × ${SECONDS} s real, ${frames} frames, ${ticks} ticks = ${(ticks / (LOOP_GAMES * SECONDS)).toFixed(2)} ticks per real s ` +
              `(requested ${(requested * 60).toFixed(1)}, dropped by the 5-steps clamp ${(dropped * 60).toFixed(1)}), max ${maxSteps} steps/frame, accounting error ${accountingErr.toExponential(1)} s; ` +
              `slow-mo: ${slowStarts} starts, ${slowFrames} frames, ${slowReal.toFixed(2)} s real → ${(slowGame * 60).toFixed(1)} ticks requested / ${slowTicks} run; replay mismatches ${mismatch}, sim reads speed/slow-mo ${speedDependent}`,
          );
          expect(mismatch).toBe(0);
          expect(speedDependent).toBe(0);
          expect(accountingErr).toBeLessThan(1e-6);
          expect(maxSteps).toBeLessThanOrEqual(TUNING.sim.maxStepsPerFrame);
          if (profile !== 'hitch') expect(Math.abs(ticks + 0 - requested * 60)).toBeLessThanOrEqual(LOOP_GAMES * 1.01);
        }
      }
    } finally {
      TUNING.game.speed = speed0;
    }
    for (const l of lines) console.log(l);
    console.log(rep.format('B4 replays of the loop runs, every tick checked'));
    console.log(`B4 runtime ${ms(t0)}`);
  });
});

/** The random human behind the real Game: presses latched until a tick uses them (as src/input/humanInput.ts). */
class PolicySource implements CommandSource {
  world: WorldState | null = null;
  private readonly tmp = emptyCommand();
  private readonly edges = { pass: false, shoot: false, dribble: false, switchPlayer: false };
  /** The command given to the game in the last frame. */
  readonly last = emptyCommand();

  constructor(private readonly pol: Policy) {}

  read(out: PlayerCommand): void {
    if (this.world) policyStep(this.world, this.pol, this.tmp);
    const e = this.edges;
    e.pass ||= this.tmp.pass;
    e.shoot ||= this.tmp.shoot;
    e.dribble ||= this.tmp.dribble;
    e.switchPlayer ||= this.tmp.switchPlayer;
    Object.assign(out, this.tmp, e);
    Object.assign(this.last, out);
  }

  consumeEdges(): void {
    this.edges.pass = this.edges.shoot = this.edges.dribble = this.edges.switchPlayer = false;
  }
}
