import { test, type CDPSession, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Render performance audit (§C of docs/AUDITORIA_F1.md → docs/audit/C.md). SKIPPED unless
// PATINS_PERF=1, so CI is unaffected:
//   npm run build && PATINS_PERF=1 npx playwright test tests/e2e/perfStress.spec.ts
//
// What it measures, per frame, inside the page (window.__PATINS__): the interval between frames,
// the sim (FixedStepLoop.advance: every tick of the frame), Renderer.sync (meshes, sticks,
// camera), Renderer.render (Babylon scene.render: CPU side of the draw submission, incl. the
// shadow map pass), the HUD (Game.onFrame callbacks) and, from CDP Performance.getMetrics, the
// whole main-thread busy time (script + style + layout + GC + compositor commits). With CPU
// throttling ×1, ×4 and ×6 (CDP Emulation.setCPUThrottlingRate), quality low and medium.
//
// CAVEAT: headless Chromium has no GPU here: WebGL runs on SwiftShader (on the CPU, in the GPU
// process, NOT throttled). The frame interval is therefore SwiftShader's raster time, not the
// Pixel 8a's; the main-thread numbers (sim, sync, render submit, HUD) are what the throttle
// emulates. Compare ratios, not absolute values.
//
// "10 entities" = today's world (human + 2 teammates) plus 7 more players pushed into the live
// game world from the test (a teammate and a goalkeeper for team 0, 4 skaters and a goalkeeper
// for team 1), driven by a tiny test-only page script (chase the ball, spots, passes, shots):
// the renderer creates their meshes itself (capsule + nose + stick + number label each, shadow
// casters), so it is today's renderer and sim with the F2 head count. It is NOT the F4 art
// (rigged low-poly models, team kits): those will cost more per player.

const PERF = Boolean(process.env.PATINS_PERF);
const THROTTLES = [1, 4, 6] as const;
const WINDOW_MS = 5000;

type Frame = [interval: number, sim: number, ticks: number, sync: number, render: number, hud: number, arrow: number, compiled: number];

interface Stats {
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

function stats(xs: number[]): Stats {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] ?? 0;
  return { mean: xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length), p50: at(0.5), p95: at(0.95), max: s[s.length - 1] ?? 0 };
}

const f2 = (s: Stats): string => `${s.mean.toFixed(2)}/${s.p95.toFixed(2)}/${s.max.toFixed(1)}`;

/** Wrap the game loop, renderer and HUD callbacks to time each part of every frame. */
async function instrument(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Fn = (...a: unknown[]) => unknown;
    const P = (window as unknown as { __PATINS__: Record<string, unknown> }).__PATINS__;
    const g = P.game as { loop: { advance: Fn; lastSteps: number }; world: { aimActive: boolean }; onFrame(cb: () => void): void; onFrameCallbacks: (() => void)[] };
    const r = P.renderer as { sync: Fn; render: Fn; engine: { _compiledEffects?: object } };
    let effects = Object.keys(r.engine._compiledEffects ?? {}).length;
    const rec = { on: false, frames: [] as number[][], drive: null as null | (() => void) };
    (window as unknown as { __perfStress: typeof rec }).__perfStress = rec;
    let lastStart = -1;
    let interval = 0;
    let sim = 0;
    let sync = 0;
    let render = 0;
    let hud = 0;
    const advance = g.loop.advance.bind(g.loop);
    g.loop.advance = function patinsSim(...a: unknown[]) {
      const t0 = performance.now();
      interval = lastStart < 0 ? 0 : t0 - lastStart;
      lastStart = t0;
      rec.drive?.();
      advance(...a);
      sim = performance.now() - t0;
      return undefined;
    };
    const rsync = r.sync.bind(r);
    r.sync = function patinsSync(...a: unknown[]) {
      const t0 = performance.now();
      rsync(...a);
      sync = performance.now() - t0;
      return undefined;
    };
    const rrender = r.render.bind(r);
    r.render = function patinsRender() {
      const t0 = performance.now();
      rrender();
      render = performance.now() - t0;
      return undefined;
    };
    const cbs = g.onFrameCallbacks;
    for (let i = 0; i < cbs.length; i++) {
      const cb = cbs[i]!;
      cbs[i] = function patinsHud() {
        const t0 = performance.now();
        cb();
        hud += performance.now() - t0;
      };
    }
    g.onFrame(() => {
      const e = Object.keys(r.engine._compiledEffects ?? {}).length;
      if (rec.on && interval > 0) rec.frames.push([interval, sim, g.loop.lastSteps, sync, render, hud, g.world.aimActive ? 1 : 0, e - effects]);
      effects = e;
      hud = 0;
    });
  });
}

/** Add 7 players to the live world (10 entities) and a test-only driver for the non-bot ones. */
async function addEntities(page: Page): Promise<void> {
  await page.evaluate(() => {
    type P = { id: number; x: number; y: number; vx: number; vy: number; heading: number; team: number; bot: boolean; holdTime: number; prevX: number; prevY: number; prevHeading: number };
    type C = { moveX: number; moveY: number; sprint: boolean; pass: boolean; shoot: boolean; dribble: boolean; passHeld: boolean; passHeight: number; shootHeld: boolean; shootHeight: number; switchPlayer: boolean };
    const PAT = (window as unknown as { __PATINS__: Record<string, unknown> }).__PATINS__;
    const g = PAT.game as { world: { players: P[]; ball: { x: number; y: number; vx: number; vy: number; owner: number }; controlled: number; tick: number }; commands: C[] };
    const w = g.world;
    const gx = 20 - 2.8;
    const spawn = (id: number, x: number, y: number, heading: number, team: number): void => {
      const p = structuredClone(w.players[1]!) as P;
      Object.assign(p, { id, x, y, prevX: x, prevY: y, vx: 0, vy: 0, heading, prevHeading: heading, team, bot: false, holdTime: 0 });
      w.players.push(p);
    };
    spawn(3, 2, 6, 0, 0);
    spawn(4, -gx + 0.9, 0, 0, 0);
    for (let k = 0; k < 4; k++) spawn(5 + k, 3 + (k >> 1) * 6, (k % 2 === 0 ? 1 : -1) * 4, Math.PI, 1);
    spawn(9, gx - 0.9, 0, Math.PI, 1);
    // Index 3 joins the human's teammates (sim-driven F1.4 bot).
    w.players[3]!.bot = true;
    while (g.commands.length < w.players.length) g.commands.push({ moveX: 0, moveY: 0, sprint: false, pass: false, shoot: false, dribble: false, passHeld: false, passHeight: 0, shootHeld: false, shootHeight: 0, switchPlayer: false });
    let seed = 12345;
    const rnd = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const stick = (c: C, a: number, m: number): void => {
      c.moveX = Math.cos(a) * m;
      c.moveY = Math.sin(a) * m;
    };
    const rec = (window as unknown as { __perfStress: { drive: (() => void) | null } }).__perfStress;
    rec.drive = () => {
      const b = w.ball;
      for (let i = 0; i < w.players.length; i++) {
        const p = w.players[i]!;
        if (p.bot || i === w.controlled) continue;
        const c = g.commands[i]!;
        c.pass = c.shoot = c.sprint = false;
        const attack = p.team === 0 ? 1 : -1;
        const gk = i === 4 || i === 9;
        if (b.owner === i) {
          const dGoal = Math.hypot(attack * gx - b.x, b.y);
          if (!gk && dGoal < 12 && rnd() < 0.08) {
            c.shoot = true;
            c.shootHeight = rnd() < 0.5 ? 0 : 1;
            stick(c, Math.atan2(-b.y * 0.3, attack * gx - p.x), 1);
          } else if (p.holdTime > 0.6 && rnd() < 0.08) {
            let j = -1;
            for (let t = 0; t < 6 && j < 0; t++) {
              const k = Math.floor(rnd() * w.players.length);
              if (k !== i && w.players[k]!.team === p.team) j = k;
            }
            if (j >= 0) {
              c.pass = true;
              c.passHeight = rnd() < 0.5 ? 0 : rnd() < 0.7 ? 1 : 2;
              stick(c, Math.atan2(w.players[j]!.y - p.y, w.players[j]!.x - p.x), 1);
            }
          } else stick(c, Math.atan2(-p.y * 0.4, attack * gx - p.x) + 0.7 * Math.sin(w.tick * 0.05 + i), 0.85);
          continue;
        }
        let tx: number;
        let ty: number;
        if (gk) {
          tx = -attack * gx + attack * 0.9;
          ty = Math.max(-1.1, Math.min(1.1, b.y * 0.3));
        } else {
          let near = -1;
          let nd = Infinity;
          for (let j = 0; j < w.players.length; j++) {
            const o = w.players[j]!;
            if (o.team !== p.team || j === 4 || j === 9) continue;
            const d = Math.hypot(o.x - b.x, o.y - b.y);
            if (d < nd) {
              nd = d;
              near = j;
            }
          }
          const mine = b.owner >= 0 && w.players[b.owner]!.team === p.team;
          if (!mine && near === i) {
            tx = b.x + b.vx * 0.2;
            ty = b.y + b.vy * 0.2;
          } else {
            const role = i % 4;
            tx = Math.max(-16, Math.min(16, mine ? b.x + attack * (3 + role) : b.x - attack * (2 + role * 1.5)));
            ty = Math.max(-8, Math.min(8, b.y * 0.5 + (role % 2 === 0 ? 1 : -1) * (2.5 + (role >> 1) * 2)));
          }
        }
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d < 0.4) stick(c, Math.atan2(b.y - p.y, b.x - p.x), 0.06);
        else stick(c, Math.atan2(ty - p.y, tx - p.x), Math.max(0.2, Math.min(1, d / 1.5)));
        c.sprint = d > 6 && !gk;
      }
    };
  });
}

/** Keep the human skating around (keyboard), changing direction every 1.2 s. */
async function skate(page: Page, ms: number, phase: { i: number }): Promise<void> {
  const keys = ['KeyD', 'KeyW', 'KeyA', 'KeyS'];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await page.keyboard.up(keys[phase.i % 4]!);
    phase.i++;
    await page.keyboard.down(keys[phase.i % 4]!);
    await page.waitForTimeout(Math.min(1200, Math.max(0, end - Date.now())));
  }
}

type Metrics = Record<string, number>;
async function metrics(cdp: CDPSession): Promise<Metrics> {
  const r = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}

interface Window {
  throttle: number;
  frames: number;
  fps: number;
  interval: Stats;
  sim: Stats;
  /** Sim per tick (frame sim / ticks of the frame). */
  simTick: Stats;
  ticks: number;
  sync: Stats;
  render: Stats;
  hud: Stats;
  work: Stats;
  /** Main-thread busy time per frame from CDP (ms): all tasks / script / style+layout. */
  taskPerFrame: number;
  scriptPerFrame: number;
  styleLayoutPerFrame: number;
  gcHeapMB: number;
  /** Babylon SceneInstrumentation (ms per frame, CPU side): active meshes evaluation, render targets (shadow map), whole render. */
  activeMeshes: number;
  renderTargets: number;
  renderTime: number;
  drawCalls: number;
  triangles: number;
  meshes: number;
  arrowSim?: Stats;
  noArrowSim?: Stats;
  arrowFrames: number;
  /** Shaders compiled during the window (first use of a material = a hitch), and the frames whose work took > 30 ms. */
  compiled: number;
  spikes: string[];
}

async function measure(page: Page, cdp: CDPSession, throttle: number, phase: { i: number }, during?: () => Promise<void>): Promise<Window> {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await skate(page, 1500, phase);
  await page.evaluate(() => {
    const P = (window as unknown as { __PATINS__: { perf(): unknown; renderer: Record<string, unknown> } }).__PATINS__;
    P.perf();
    const inst = P.renderer.instrumentation as Record<string, unknown>;
    inst.captureActiveMeshesEvaluationTime = true;
    inst.captureRenderTargetsRenderTime = true;
    inst.captureRenderTime = true;
    const c = (n: string): { total: number; count: number } => inst[n] as { total: number; count: number };
    const eng = (P.renderer as unknown as { engine: { _compiledEffects?: object } }).engine;
    (window as unknown as { __inst0: number[] }).__inst0 = [c('activeMeshesEvaluationTimeCounter').total, c('renderTargetsRenderTimeCounter').total, c('renderTimeCounter').total, c('renderTimeCounter').count, Object.keys(eng._compiledEffects ?? {}).length];
    const rec = (window as unknown as { __perfStress: { on: boolean; frames: unknown[] } }).__perfStress;
    rec.frames = [];
    rec.on = true;
  });
  const m0 = await metrics(cdp);
  if (during) await during();
  else await skate(page, WINDOW_MS, phase);
  const m1 = await metrics(cdp);
  const res = await page.evaluate(() => {
    const W = window as unknown as { __PATINS__: { perf(): Record<string, number>; renderer: Record<string, unknown> }; __perfStress: { on: boolean; frames: number[][] }; __inst0: number[] };
    W.__perfStress.on = false;
    const inst = W.__PATINS__.renderer.instrumentation as Record<string, { total: number; count: number }>;
    const i0 = W.__inst0;
    const n = Math.max(1, inst.renderTimeCounter!.count - i0[3]!);
    const eng = (W.__PATINS__.renderer as unknown as { engine: { _compiledEffects?: object } }).engine;
    return {
      compiled: Object.keys(eng._compiledEffects ?? {}).length - i0[4]!,
      frames: W.__perfStress.frames,
      inst: [(inst.activeMeshesEvaluationTimeCounter!.total - i0[0]!) / n, (inst.renderTargetsRenderTimeCounter!.total - i0[1]!) / n, (inst.renderTimeCounter!.total - i0[2]!) / n],
      perf: W.__PATINS__.perf(),
    };
  });
  const frames = res.frames as Frame[];
  const n = Math.max(1, frames.length);
  const secs = (m1.Timestamp! - m0.Timestamp!) || WINDOW_MS / 1000;
  const out: Window = {
    throttle,
    frames: frames.length,
    fps: frames.length / secs,
    interval: stats(frames.map((f) => f[0])),
    sim: stats(frames.map((f) => f[1])),
    simTick: stats(frames.filter((f) => f[2] > 0).map((f) => f[1] / f[2])),
    ticks: frames.reduce((s, f) => s + f[2], 0) / n,
    sync: stats(frames.map((f) => f[3])),
    render: stats(frames.map((f) => f[4])),
    hud: stats(frames.map((f) => f[5])),
    work: stats(frames.map((f) => f[1] + f[3] + f[4] + f[5])),
    taskPerFrame: ((m1.TaskDuration! - m0.TaskDuration!) * 1000) / n,
    scriptPerFrame: ((m1.ScriptDuration! - m0.ScriptDuration!) * 1000) / n,
    styleLayoutPerFrame: ((m1.RecalcStyleDuration! - m0.RecalcStyleDuration! + m1.LayoutDuration! - m0.LayoutDuration!) * 1000) / n,
    gcHeapMB: m1.JSHeapUsedSize! / 1e6,
    activeMeshes: res.inst[0]!,
    renderTargets: res.inst[1]!,
    renderTime: res.inst[2]!,
    drawCalls: res.perf.drawCalls!,
    triangles: res.perf.triangles!,
    meshes: res.perf.activeMeshes!,
    arrowFrames: frames.filter((f) => f[6] === 1).length,
    compiled: res.compiled,
    spikes: frames.map((f, i) => [f, i] as const).filter(([f]) => f[1] + f[3] + f[4] + f[5] > 30).map(([f, i]) => `#${i}: sim ${f[1].toFixed(1)} sync ${f[3].toFixed(1)} render ${f[4].toFixed(1)} hud ${f[5].toFixed(1)}${f[7] ? ` (+${f[7]} shaders)` : ''}`),
  };
  // Sim per TICK (the frame's sim time / its ticks), with and without the arrow at the end of the frame.
  const arrow = frames.filter((f) => f[6] === 1 && f[2] > 0).map((f) => f[1] / f[2]);
  if (arrow.length) {
    out.arrowSim = stats(arrow);
    out.noArrowSim = stats(frames.filter((f) => f[6] === 0 && f[2] > 0).map((f) => f[1] / f[2]));
  }
  return out;
}

function line(tag: string, r: Window): string {
  return `${tag} cpu×${r.throttle}: fps ${r.fps.toFixed(1)} interval ${f2(r.interval)} | work ${f2(r.work)} = sim ${f2(r.sim)} (${r.ticks.toFixed(2)} ticks/frame; per tick ${f2(r.simTick)}) + sync ${f2(r.sync)} + render ${f2(r.render)} + hud ${f2(r.hud)} | main thread/frame: tasks ${r.taskPerFrame.toFixed(2)} script ${r.scriptPerFrame.toFixed(2)} style+layout ${r.styleLayoutPerFrame.toFixed(2)} | babylon: activeMeshes ${r.activeMeshes.toFixed(2)} shadowRT ${r.renderTargets.toFixed(2)} render ${r.renderTime.toFixed(2)} | ${r.drawCalls} draws ${r.triangles} tris ${r.meshes} meshes | heap ${r.gcHeapMB.toFixed(1)} MB | shaders compiled ${r.compiled}${r.spikes.length ? ` | spikes >30 ms: ${r.spikes.join('; ')}` : ''} (mean/p95/max ms)`;
}

async function start(page: Page, quality: string): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(`./?quality=${quality}`);
  await page.evaluate(() => localStorage.setItem('patins.settings.v1', JSON.stringify({ camera: 'tv' })));
  await page.reload();
  await page.click('#btn-play');
  await page.keyboard.down('ShiftLeft');
  await instrument(page);
  return cdp;
}

test.describe('render performance audit (§C)', () => {
  test.skip(!PERF, 'only with PATINS_PERF=1 (docs/audit/C.md)');

  // 'X@1/4' = quality X drawn at 1/4 resolution: SwiftShader then runs at ~60 fps, i.e. ~1 tick per
  // frame as on the phone (per-tick sim cost and per-frame CPU costs in that regime, with less
  // SwiftShader back-pressure leaking into the main thread). The shadow map keeps its size.
  for (const quality of ['low', 'medium', 'low@1/4', 'medium@1/4'] as const) {
    for (const entities of [3, 10] as const) {
      test(`frame cost: ${entities} entities, quality ${quality}, CPU ×1 / ×4 / ×6`, async ({ page }) => {
        test.setTimeout(180_000);
        const quarter = quality.endsWith('@1/4');
        const cdp = await start(page, quality.replace('@1/4', ''));
        if (quarter) await page.evaluate(() => (window as unknown as { __PATINS__: { renderer: { engine: { setHardwareScalingLevel(l: number): void } } } }).__PATINS__.renderer.engine.setHardwareScalingLevel(4));
        if (entities === 10) await addEntities(page);
        const phase = { i: 0 };
        await page.keyboard.down('KeyD');
        await page.waitForTimeout(2500);
        const results: Window[] = [];
        for (const t of THROTTLES) {
          const r = await measure(page, cdp, t, phase);
          results.push(r);
          console.log(line(`STRESS q=${quality} n=${entities}`, r));
        }
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        // Draw calls with every player in view (tactical camera, high above the rink).
        await page.evaluate(() => (window as unknown as { __PATINS__: { renderer: { cameraRig: { setPreset(id: string): void } } } }).__PATINS__.renderer.cameraRig.setPreset('tactical'));
        await page.waitForTimeout(2500);
        const all = await page.evaluate(() => (window as unknown as { __PATINS__: { perf(): Record<string, number> } }).__PATINS__.perf());
        console.log(`STRESS q=${quality} n=${entities} tactical camera (all in view): ${all.drawCalls} draws ${all.triangles} tris ${all.activeMeshes} meshes`);
        mkdirSync('test-results', { recursive: true });
        writeFileSync(`test-results/perfStress-${quality.replace('@1/4', '-quarter')}-${entities}.json`, JSON.stringify(results, null, 2));
      });
    }
  }

  // performance.now() is clamped to 0.1 ms in this (non cross-origin-isolated) page: the per-frame
  // timers above are quantized. A sampling CPU profile gives unbiased shares of the frame.
  // "fast" = the same scene drawn at 1/4 resolution so that SwiftShader reaches ~1-2 ticks per
  // frame, as on the phone at 60 fps (the per-tick cost depends on how many ticks share a frame).
  for (const [entities, fast] of [[3, false], [10, false], [3, true], [10, true]] as const) {
    test(`CPU profile of the frame: ${entities} entities, quality medium${fast ? ', 1/4 resolution (few ticks per frame)' : ''}, CPU ×1 / ×4`, async ({ page }) => {
      test.setTimeout(180_000);
      const cdp = await start(page, fast ? 'low' : 'medium');
      if (fast) await page.evaluate(() => (window as unknown as { __PATINS__: { renderer: { engine: { setHardwareScalingLevel(l: number): void } } } }).__PATINS__.renderer.engine.setHardwareScalingLevel(4));
      if (entities === 10) await addEntities(page);
      const phase = { i: 0 };
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(2500);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      for (const t of [1, 4] as const) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: t });
        await skate(page, 1500, phase);
        const f0 = await page.evaluate(() => (window as unknown as { __PATINS__: { game: { world: { tick: number } } } }).__PATINS__.game.world.tick);
        const frames0 = await page.evaluate(() => (window as unknown as { __PATINS__: { game: { frameStats: { size: number } } } }).__PATINS__.game.frameStats.size);
        await cdp.send('Profiler.start');
        const w0 = Date.now();
        // Count frames with a rAF counter during the window.
        await page.evaluate(() => {
          const W = window as unknown as { __rafCount: number; __rafOn: boolean };
          W.__rafCount = 0;
          W.__rafOn = true;
          const tick = (): void => {
            if (!W.__rafOn) return;
            W.__rafCount++;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await skate(page, WINDOW_MS, phase);
        const frames = await page.evaluate(() => {
          const W = window as unknown as { __rafCount: number; __rafOn: boolean };
          W.__rafOn = false;
          return W.__rafCount;
        });
        const { profile } = (await cdp.send('Profiler.stop')) as { profile: { nodes: { id: number; callFrame: { functionName: string }; children?: number[] }[]; samples?: number[]; timeDeltas?: number[] } };
        const wall = Date.now() - w0;
        const ticks = (await page.evaluate(() => (window as unknown as { __PATINS__: { game: { world: { tick: number } } } }).__PATINS__.game.world.tick)) - f0;
        void frames0;
        const parent = new Map<number, number>();
        const byId = new Map<number, { id: number; callFrame: { functionName: string } }>();
        for (const n of profile.nodes) {
          byId.set(n.id, n);
          for (const c of n.children ?? []) parent.set(c, n.id);
        }
        const tracked = ['patinsSim', 'patinsSync', 'patinsRender', 'patinsHud', '(garbage collector)', '(idle)', '(program)'];
        const tot = new Map<string, number>(tracked.map((k) => [k, 0]));
        let all = 0;
        const samples = profile.samples ?? [];
        const deltas = profile.timeDeltas ?? [];
        for (let i = 0; i < samples.length; i++) {
          const dt = (deltas[i] ?? 0) / 1000;
          all += dt;
          const seen = new Set<string>();
          let id: number | undefined = samples[i];
          while (id !== undefined) {
            const name = byId.get(id)!.callFrame.functionName;
            if (tot.has(name) && !seen.has(name)) {
              seen.add(name);
              tot.set(name, tot.get(name)! + dt);
            }
            id = parent.get(id);
          }
        }
        const per = (k: string): string => (tot.get(k)! / Math.max(1, frames)).toFixed(2);
        console.log(`PROFILE n=${entities} ${fast ? 'q=low@1/4res' : 'q=medium'} cpu×${t}: ${frames} frames, ${ticks} ticks in ${(wall / 1000).toFixed(1)} s (sampled ${(all / 1000).toFixed(1)} s) | per frame (ms): sim ${per('patinsSim')} (per tick ${(tot.get('patinsSim')! / Math.max(1, ticks)).toFixed(3)}) sync ${per('patinsSync')} render ${per('patinsRender')} hud ${per('patinsHud')} GC ${per('(garbage collector)')} program ${per('(program)')} idle ${per('(idle)')}`);
      }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    });
  }

  test('pass arrow while PASE is held (driven lofted), sim per frame, and Math.hypot in Chromium', async ({ page }) => {
    test.setTimeout(180_000);
    const cdp = await start(page, 'medium');
    const phase = { i: 0 };
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');
    // Hold U (driven lofted) + J (PASE) 0.6 s, release, wait for the receiver (the control goes to him).
    const arrowLoop = async (): Promise<void> => {
      const end = Date.now() + 8000;
      while (Date.now() < end) {
        // Test-only: give the controlled player the ball so that every hold draws the arrow.
        await page.evaluate(() => {
          const w = (window as unknown as { __PATINS__: { game: { world: { controlled: number; players: { x: number; y: number; heading: number }[]; ball: { owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number } } } } }).__PATINS__.game.world;
          const p = w.players[w.controlled]!;
          Object.assign(w.ball, { owner: w.controlled, x: p.x + Math.cos(p.heading) * 0.6, y: p.y + Math.sin(p.heading) * 0.6, z: 0.0366, vx: 0, vy: 0, vz: 0 });
        });
        await page.keyboard.down('KeyU');
        await page.keyboard.down('KeyJ');
        await page.waitForTimeout(600);
        await page.keyboard.up('KeyJ');
        await page.keyboard.up('KeyU');
        await page.waitForTimeout(900);
      }
    };
    for (const t of THROTTLES) {
      const r = await measure(page, cdp, t, phase, arrowLoop);
      console.log(line('ARROW q=medium n=3', r));
      console.log(`ARROW cpu×${t}: sim per tick with the arrow ${r.arrowSim ? f2(r.arrowSim) : '-'} (${r.arrowFrames} frames) | without ${r.noArrowSim ? f2(r.noArrowSim) : '-'} ms (mean/p95/max)`);
      // Reference: the existing 3-player sim micro-bench (benchSim) and Math.hypot vs sqrt in this V8.
      const ref = await page.evaluate(() => {
        const P = (window as unknown as { __PATINS__: { benchSim(n: number): number } }).__PATINS__;
        const loop = (h: boolean): number => {
          let vh = 10;
          let vz = 3;
          let x = 0;
          const t0 = performance.now();
          for (let i = 0; i < 200000; i++) {
            const s = Math.max(0, 1 - 0.001 * (h ? Math.hypot(vh, vz) : Math.sqrt(vh * vh + vz * vz)) * 0.008);
            vh *= s;
            vz = (vz - 0.08) * s;
            x += vh;
          }
          return ((performance.now() - t0) * 1e6) / 200000 + (x > 0 ? 0 : 1);
        };
        loop(true);
        loop(false);
        // benchSim warmed up first (its first call includes the JIT warm-up).
        P.benchSim(3000);
        return { benchSimUs: P.benchSim(20000) * 1000, hypotNs: loop(true), sqrtNs: loop(false) };
      });
      console.log(`REF cpu×${t}: benchSim (3 players, no PASE) ${ref.benchSimUs.toFixed(1)} µs/tick | Math.hypot ${ref.hypotNs.toFixed(1)} ns vs sqrt ${ref.sqrtNs.toFixed(1)} ns per solver step`);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});
