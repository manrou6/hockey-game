import { test, expect } from '@playwright/test';

test('debug panel shows with ?debug=1 and the sim advances at 60 Hz', async ({ page }) => {
  await page.goto('./?debug=1');
  const panel = page.locator('#debug-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('fps');
  const t0 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  await page.waitForTimeout(2000);
  const t1 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  // Fixed-step sim: ~120 ticks in 2 s of wall time (slack for slow CI frames being clamped).
  expect(t1 - t0).toBeGreaterThan(60);
  expect(t1 - t0).toBeLessThan(135);
});

test('debug panel is hidden by default', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#debug-panel')).toHaveCount(0);
});
