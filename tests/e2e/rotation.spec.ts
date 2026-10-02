import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 411, height: 914 } });

test('portrait: the game is drawn sideways (landscape layout) and touch input still matches', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?quality=low');

  // Landscape render buffer even though the viewport is portrait.
  await expect
    .poll(() => page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      return c.width > c.height;
    }))
    .toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/f0-portrait.png' });

  await page.click('#btn-play');
  await expect(page.locator('#hud')).toBeVisible();

  // Rotated 90° clockwise: the landscape "left half" is the top half of the portrait
  // viewport, and landscape "right" is viewport "down".
  const p0 = await page.evaluate(() => ({ ...(window as any).__PATINS__.game.world.players[0] }));
  await page.mouse.move(205, 200);
  await page.mouse.down();
  await page.mouse.move(205, 280, { steps: 4 });
  await page.waitForTimeout(1200);
  const p1 = await page.evaluate(() => ({ ...(window as any).__PATINS__.game.world.players[0] }));
  await page.mouse.up();
  expect(p1.x - p0.x).toBeGreaterThan(0.3);
  expect(Math.abs(p1.y - p0.y)).toBeLessThan(0.3);

  // Turning the phone to landscape removes the rotation.
  await page.setViewportSize({ width: 914, height: 411 });
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.getElementById('app')!).transform))
    .toBe('none');
  expect(errors).toEqual([]);
});
