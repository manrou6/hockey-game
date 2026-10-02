import { test, expect } from '@playwright/test';

// docs/05 "Tests mínimos — E2E": load in a mobile landscape viewport, enter play,
// 10 s of gameplay without console errors, screenshots.
test('mobile landscape: menu → play → 10 s skating without console errors', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#btn-play')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/f0-menu.png' });

  await page.click('#btn-play');
  await expect(page.locator('#hud')).toBeVisible();
  const tick0 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);

  // Skate a loop with the virtual joystick (left thumb) for ~10 s, sprinting half the time.
  const vp = page.viewportSize()!;
  const cx = vp.width * 0.18;
  const cy = vp.height * 0.65;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const sprint = page.locator('#btn-sprint');
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * 55, cy - Math.sin(a) * 55, { steps: 3 });
    if (i === 10) await sprint.dispatchEvent('pointerdown', { pointerId: 99, isPrimary: false });
    await page.waitForTimeout(500);
    if (i === 14) await page.screenshot({ path: 'test-results/screenshots/f0-gameplay.png' });
  }
  await sprint.dispatchEvent('pointerup', { pointerId: 99, isPrimary: false });
  await page.mouse.up();

  const tick1 = await page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  expect(tick1).toBeGreaterThan(tick0);
  const p = await page.evaluate(() => (window as any).__PATINS__.game.world.players[0]);
  expect(Math.hypot(p.x + 4, p.y)).toBeGreaterThan(0.5); // actually moved from the start spot

  await page.click('#btn-pause');
  await page.click('#btn-settings');
  await page.screenshot({ path: 'test-results/screenshots/f0-settings.png' });
  expect(errors).toEqual([]);
});
