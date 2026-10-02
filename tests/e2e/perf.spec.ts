import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// docs/05 "Rendimiento": measure in mobile mode with CPU throttling and report frame
// time mean/p95. Headless Chromium has no GPU (SwiftShader renders on the CPU), so wall
// frame time here is NOT representative of the Pixel 8a; the meaningful numbers are the
// JS work per frame (sim + render submit) under 4× CPU throttling and the render budget
// counters (draw calls, triangles) from docs/04.
for (const camera of ['tv', 'close', 'tactical'] as const) test(`performance budget, ${camera} camera (4× CPU throttle, Pixel 8a landscape, medium quality)`, async ({ page }) => {
  test.setTimeout(90_000);
  const cdp = await page.context().newCDPSession(page);
  await page.goto('./?quality=medium');
  await page.evaluate((c) => localStorage.setItem('patins.settings.v1', JSON.stringify({ camera: c })), camera);
  await page.reload();
  await page.click('#btn-play');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  // First call starts the draw-call instrumentation; read again after a few frames.
  await page.evaluate(() => (window as any).__PATINS__.perf());
  await page.waitForTimeout(1500);
  const perf = await page.evaluate(() => (window as any).__PATINS__.perf());
  perf.simTickMs = await page.evaluate(() => (window as any).__PATINS__.benchSim(6000));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/perf-${camera}.json`, JSON.stringify(perf, null, 2));
  console.log('PERF', camera, JSON.stringify(perf));

  expect(perf.drawCalls).toBeLessThanOrEqual(120);
  expect(perf.triangles).toBeLessThanOrEqual(200_000);
  // One sim tick must be a tiny fraction of the 16.7 ms frame even on a 4× slower CPU.
  expect(perf.simTickMs).toBeLessThan(0.5);
});
