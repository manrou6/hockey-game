import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 411, height: 914 } });

test('portrait shows an opaque rotate screen with a landscape button; rotating resumes the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');

  const hint = page.locator('#rotate-hint');
  await expect(hint).toBeVisible();
  await expect(page.locator('#btn-rotate')).toHaveText('Jugar en horitzontal');
  // Tapping it must never throw, even where fullscreen/orientation lock is refused.
  await page.click('#btn-rotate');
  await page.screenshot({ path: 'test-results/screenshots/f0-portrait.png' });

  await page.setViewportSize({ width: 914, height: 411 });
  await expect(hint).toBeHidden();
  await expect(page.locator('#btn-play')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      return c.width > c.height;
    }))
    .toBe(true);
  await page.click('#btn-play');
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});
