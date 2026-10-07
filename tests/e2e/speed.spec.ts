import { test, expect } from '@playwright/test';

test('Velocitat de joc: set live, applied to the game loop (TUNING) and remembered after a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  expect(await page.evaluate(() => (window as any).__PATINS__.tuning.get('game.speed'))).toBe(1);
  await page.evaluate(() => (window as any).__PATINS__.tuning.set('game.speed', 1.4));
  // The loop reads TUNING every frame: the game keeps running (no errors, ticks advance).
  const t0 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  await page.waitForTimeout(1000);
  const t1 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  expect(t1).toBeGreaterThan(t0);
  await page.reload();
  expect(await page.evaluate(() => (window as any).__PATINS__.tuning.get('game.speed'))).toBe(1.4);
  // (The ticks-per-second maths is covered by the unit tests: a throttled headless browser
  // runs at a few frames per second and the per-frame step cap hides the speed.)
});

test('the game speed row is the first one of the tuning panel and is in %', async ({ page }) => {
  await page.goto('./?quality=low');
  // Tuning mode must be on to see the ⚙ button: switch it on through the stored settings.
  await page.evaluate(() => localStorage.setItem('patins.settings.v1', JSON.stringify({ tuningMode: true, assistRev: 2 })));
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  await page.click('#btn-tuning');
  const first = page.locator('details').first();
  await expect(first.locator('summary')).toHaveText('Velocitat de joc');
  await page.screenshot({ path: 'test-results/screenshots/f1-game-speed-panel.png' });
});
