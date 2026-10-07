import { test, expect } from '@playwright/test';

test('ball silhouette: shown only when the ball is next to the near board, and switchable in the panel values', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const place = (y: number) =>
    page.evaluate((yy) => {
      const w = (window as any).__PATINS__.game.world;
      w.ball.owner = -1;
      w.ball.x = w.ball.prevX = 2;
      w.ball.y = w.ball.prevY = yy;
      w.ball.vx = w.ball.vy = w.ball.vz = 0;
    }, y);
  const ghost = () => page.evaluate(() => (window as any).__PATINS__.renderer.ballGhostVisible as boolean);
  await place(-9.7);
  await expect.poll(ghost, { timeout: 3_000 }).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/f1-ball-ghost.png' });
  await place(0);
  await expect.poll(ghost, { timeout: 3_000 }).toBe(false);
  await place(-9.7);
  await page.evaluate(() => (window as any).__PATINS__.tuning.set('ball.ghost', 0));
  await expect.poll(ghost, { timeout: 3_000 }).toBe(false);
});
