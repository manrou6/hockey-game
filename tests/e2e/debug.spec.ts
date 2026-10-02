import { test, expect } from '@playwright/test';

test('debug panel shows with ?debug=1 and the sim advances', async ({ page }) => {
  await page.goto('./?debug=1');
  const panel = page.locator('#debug-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('fps');
  await page.click('#btn-play');
  const t0 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  await page.waitForTimeout(2000);
  const t1 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  // Headless Chromium renders on the CPU (SwiftShader) at a few fps, so catch-up is clamped
  // (maxStepsPerFrame). The exact 60 Hz contract is covered by unit tests; here we only
  // check the loop runs and never exceeds real time.
  expect(t1 - t0).toBeGreaterThan(5);
  expect(t1 - t0).toBeLessThan(135);
});

test('debug panel is hidden by default', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#debug-panel')).toHaveCount(0);
});
