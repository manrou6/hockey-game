import { test, expect } from '@playwright/test';

test('skating onto the ball takes it; carrying it into the goal scores and it comes back to the centre', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const ball = () => page.evaluate(() => ({ ...(window as any).__PATINS__.game.world.ball }));
  const b0 = await ball();
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ShiftLeft');
  await expect.poll(async () => (await ball()).x, { timeout: 30_000 }).toBeGreaterThan(b0.x + 1);
  // Keep carrying it towards the right goal until it scores (headless renders slowly).
  await expect.poll(async () => (await ball()).scored, { timeout: 60_000 }).toBe(true);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ShiftLeft');
  await expect.poll(async () => (await ball()).x, { timeout: 30_000 }).toBe(0);
  expect(errors).toEqual([]);
});
