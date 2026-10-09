import { test, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';

// docs/audit/I.md (§I PWA update audit). Experiment, NOT part of the normal e2e run:
//   PATINS_PWA=1 npx playwright test tests/e2e/pwaUpdate.spec.ts
// It builds the game twice (build A and build B, same code, different commit id shown in
// Configuració as "Versió v0.1.xx (aaaaaaa)" / "(bbbbbbb)"), serves them under /hockey-game/
// with GitHub Pages-like headers (Cache-Control: max-age=600, ETag, Last-Modified), "deploys"
// B while a page running A is open and records which version runs, and when.
// PATINS_PWA_REUSE=1 reuses the two builds from a previous run.

const ENABLED = process.env.PATINS_PWA === '1';
const PORT = 4180;
const BASE = `http://localhost:${PORT}/hockey-game/`;
const OUT = resolve('test-results/pwa-update');
const DIRS = { A: join(OUT, 'distA'), B: join(OUT, 'distB') } as const;
const TAGS = { A: 'aaaaaaa', B: 'bbbbbbb' } as const;
type Build = keyof typeof DIRS;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

interface Hit {
  t: number;
  path: string;
  served: Build;
  status: number;
  bytes: number;
  reqCacheControl: string;
}

let current: Build = 'A';
let t0 = Date.now();
const hits: Hit[] = [];
let server: Server | null = null;

function startServer(): Promise<Server> {
  const s = createServer((req, res) => {
    const url = new URL(req.url ?? '/', BASE);
    let rel = decodeURIComponent(url.pathname);
    if (!rel.startsWith('/hockey-game/')) {
      res.writeHead(404).end();
      return;
    }
    rel = rel.slice('/hockey-game/'.length) || 'index.html';
    const file = join(DIRS[current], rel);
    const hit: Hit = {
      t: Date.now() - t0,
      path: rel,
      served: current,
      status: 404,
      bytes: 0,
      reqCacheControl: String(req.headers['cache-control'] ?? ''),
    };
    hits.push(hit);
    if (!file.startsWith(DIRS[current]) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    const body = readFileSync(file);
    const etag = `"${createHash('md5').update(body).digest('hex')}"`;
    const headers = {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      // What GitHub Pages sends for every file (incl. sw.js and index.html).
      'Cache-Control': 'max-age=600',
      ETag: etag,
      'Last-Modified': statSync(file).mtime.toUTCString(),
    };
    if (req.headers['if-none-match'] === etag) {
      hit.status = 304;
      res.writeHead(304, headers).end();
      return;
    }
    hit.status = 200;
    hit.bytes = body.length;
    res.writeHead(200, headers).end(body);
  });
  return new Promise((ok) => s.listen(PORT, () => ok(s)));
}

function build(which: Build): void {
  if (process.env.PATINS_PWA_REUSE === '1' && existsSync(join(DIRS[which], 'sw.js'))) return;
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_SHA: `${TAGS[which]}000` };
  const r = spawnSync('npx', ['vite', 'build', '--outDir', DIRS[which], '--emptyOutDir'], { env, stdio: 'pipe' });
  if (r.status !== 0) throw new Error(`build ${which} failed:\n${String(r.stderr)}`);
}

/** Commit id shown in Configuració ("Versió v0.1.xx (aaaaaaa)"), or null while navigating. */
async function shownVersion(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => {
      const m = /\((\w{7})\)/.exec(document.getElementById('version-label')?.textContent ?? '');
      return m ? (m[1] ?? null) : null;
    });
  } catch {
    return null;
  }
}

async function waitControlled(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
}

function swChecks(since: number): Hit[] {
  return hits.filter((h) => h.path === 'sw.js' && h.t >= since);
}

const report: Record<string, unknown> = {};

test.describe('PWA update after a deploy (§I audit experiment)', () => {
  test.skip(!ENABLED, 'experiment for docs/audit/I.md: run with PATINS_PWA=1');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    build('A');
    build('B');
    server = await startServer();
  });

  test.afterAll(async () => {
    writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ report, hits }, null, 2));
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
  });

  test.beforeEach(() => {
    current = 'A';
    t0 = Date.now();
    hits.length = 0;
  });

  test('S1 reload / reopen: old version first, automatic reload to the new one', async ({ page }) => {
    test.setTimeout(120_000);
    const loads: number[] = [];
    page.on('load', () => loads.push(Date.now() - t0));
    await page.goto(BASE);
    await waitControlled(page);
    expect(await shownVersion(page)).toBe(TAGS.A);

    // "Deploy" B, then reload (= navigation, like reopening the app after swiping it away).
    current = 'B';
    const tDeploy = Date.now() - t0;
    const loadsBefore = loads.length;
    await page.reload();
    const afterReload = await shownVersion(page);
    const tReloaded = Date.now() - t0;
    // Wait for the automatic reload done by registerSW (autoUpdate) once the new SW activates.
    await expect.poll(() => shownVersion(page), { timeout: 60_000, intervals: [100] }).toBe(TAGS.B);
    const tNew = Date.now() - t0;
    const precacheB = hits.filter((h) => h.t >= tDeploy && h.served === 'B' && h.path !== 'sw.js');
    report.S1 = {
      tDeploy,
      versionRightAfterReload: afterReload,
      tReloaded,
      swChecks: swChecks(tDeploy).map((h) => ({ t: h.t, status: h.status, reqCacheControl: h.reqCacheControl })),
      indexHtmlFetches: hits.filter((h) => h.t >= tDeploy && h.path === 'index.html').map((h) => ({ t: h.t, reqCacheControl: h.reqCacheControl })),
      precacheRequests: precacheB.length,
      precacheBytes: precacheB.reduce((s, h) => s + h.bytes, 0),
      automaticReloads: loads.length - loadsBefore - 1,
      loads,
      tNewVersionShown: tNew,
    };
    console.log('S1', JSON.stringify(report.S1));
    expect(afterReload).toBe(TAGS.A); // the navigation itself is answered by the OLD service worker
  });

  test('S2 resume without navigation: stays old until registration.update()', async ({ page, context }) => {
    test.setTimeout(120_000);
    const loads: number[] = [];
    page.on('load', () => loads.push(Date.now() - t0));
    await page.goto(BASE);
    await waitControlled(page);
    expect(await shownVersion(page)).toBe(TAGS.A);
    await page.click('#btn-play');
    await expect(page.locator('#hud')).toBeVisible();

    current = 'B';
    const tDeploy = Date.now() - t0;
    const loadsBefore = loads.length;

    // Resume from Android recents: no navigation. Emulate it three ways.
    const cdp = await context.newCDPSession(page);
    const vis: string[] = [];
    await page.evaluate(() => {
      const w = window as unknown as { __vis: string[] };
      w.__vis = [];
      document.addEventListener('visibilitychange', () => w.__vis.push(document.visibilityState));
    });
    // (a) another tab in front, then back (real visibility change in Chromium).
    const other = await context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await page.waitForTimeout(1000);
    await page.bringToFront();
    await other.close();
    // (b) page frozen and resumed (what Chrome on Android does to background tabs).
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await page.waitForTimeout(1000);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    // (c) synthetic hidden → visible visibilitychange.
    await page.evaluate(() => {
      const set = (v: string): void => {
        Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      set('hidden');
      set('visible');
    });
    vis.push(...(await page.evaluate(() => (window as unknown as { __vis: string[] }).__vis)));

    // Back to the match and keep playing 20 s: nothing checks for a new version.
    await page.click('#btn-play');
    await page.waitForTimeout(20_000);
    const after20s = await shownVersion(page);
    const checksWhileOpen = swChecks(tDeploy).length;
    const tickBefore = await page.evaluate(() => (window as unknown as { __PATINS__: { game: { world: { tick: number }; paused: boolean } } }).__PATINS__.game.world.tick);
    const pausedBefore = await page.evaluate(() => (window as unknown as { __PATINS__: { game: { paused: boolean } } }).__PATINS__.game.paused);

    // What a periodic / on-resume check would do: registration.update() → new SW → page reload.
    const tUpdate = Date.now() - t0;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });
    await expect.poll(() => shownVersion(page), { timeout: 60_000, intervals: [100] }).toBe(TAGS.B);
    const tNew = Date.now() - t0;
    const tickAfter = await page.evaluate(() => (window as unknown as { __PATINS__: { game: { world: { tick: number } } } }).__PATINS__.game.world.tick);
    const menuVisible = await page.locator('#main-menu').isVisible();
    report.S2 = {
      tDeploy,
      visibilityEvents: vis,
      versionAfter20sOfResume: after20s,
      swChecksWithoutNavigation: checksWhileOpen,
      tUpdateCalled: tUpdate,
      swChecksAfterUpdate: swChecks(tUpdate).map((h) => ({ t: h.t, status: h.status, reqCacheControl: h.reqCacheControl })),
      automaticReloads: loads.length - loadsBefore,
      matchWasRunning: !pausedBefore,
      tickBeforeReload: tickBefore,
      tickAfterReload: tickAfter,
      menuVisibleAfterReload: menuVisible,
      tNewVersionShown: tNew,
      msFromUpdateToNewVersion: tNew - tUpdate,
    };
    console.log('S2', JSON.stringify(report.S2));
    expect(after20s).toBe(TAGS.A);
    expect(checksWhileOpen).toBe(0);
  });

  test('S3 new page (cold start of the installed app): old first, then reload', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(BASE);
    await waitControlled(page);
    await page.close();

    current = 'B';
    const tDeploy = Date.now() - t0;
    const fresh = await page.context().newPage();
    const loads: number[] = [];
    fresh.on('load', () => loads.push(Date.now() - t0));
    await fresh.goto(BASE);
    const first = await shownVersion(fresh);
    await expect.poll(() => shownVersion(fresh), { timeout: 60_000, intervals: [100] }).toBe(TAGS.B);
    report.S3 = {
      tDeploy,
      versionAtFirstPaint: first,
      swChecks: swChecks(tDeploy).map((h) => ({ t: h.t, status: h.status })),
      loads,
      tNewVersionShown: Date.now() - t0,
    };
    console.log('S3', JSON.stringify(report.S3));
    expect(first).toBe(TAGS.A);
  });

  test('S4 frozen app in the background + the site opened in another tab', async ({ page, context }) => {
    test.setTimeout(120_000);
    const loads: number[] = [];
    page.on('load', () => loads.push(Date.now() - t0));
    await page.goto(BASE);
    await waitControlled(page);
    await page.reload(); // like Guillem's phone: the app page starts already controlled
    await waitControlled(page);
    expect(await shownVersion(page)).toBe(TAGS.A);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); // app left in recents

    current = 'B';
    const tDeploy = Date.now() - t0;
    const n0 = loads.length;
    const tab = await context.newPage(); // the link opened in a normal Chrome tab
    await tab.goto(BASE);
    await expect.poll(() => shownVersion(tab), { timeout: 60_000, intervals: [100] }).toBe(TAGS.B);
    const tTabNew = Date.now() - t0;
    await page.waitForTimeout(2000);
    const reloadsWhileFrozen = loads.length - n0;
    await cdp.send('Page.setWebLifecycleState', { state: 'active' }); // back from recents
    const tResume = Date.now() - t0;
    await expect.poll(() => shownVersion(page), { timeout: 60_000, intervals: [100] }).toBe(TAGS.B);
    report.S4 = {
      tDeploy,
      tTabShowsNew: tTabNew,
      reloadsWhileFrozen,
      tResume,
      msResumeToNewVersion: Date.now() - t0 - tResume,
      appReloads: loads.length - n0,
    };
    console.log('S4', JSON.stringify(report.S4));
  });
});
