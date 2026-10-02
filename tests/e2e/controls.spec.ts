import { test, expect, type Page } from '@playwright/test';

type P = { x: number; y: number; vx: number; vy: number };
const player = (page: Page): Promise<P> =>
  page.evaluate(() => {
    const p = (window as any).__PATINS__.game.world.players[0];
    return { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('./?quality=low');
  await page.click('#btn-play');
});

test('keyboard: D skates right (+x), W skates away from camera (+y)', async ({ page }) => {
  const p0 = await player(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  const p1 = await player(page);
  expect(p1.x - p0.x).toBeGreaterThan(0.3);
  expect(Math.abs(p1.y - p0.y)).toBeLessThan(0.3);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const p2 = await player(page);
  expect(p2.y - p1.y).toBeGreaterThan(0.3);
});

test('virtual joystick: dragging left-half thumb to the right skates right, release glides', async ({ page }) => {
  const vp = page.viewportSize()!;
  const sx = vp.width * 0.2;
  const sy = vp.height * 0.7;
  const p0 = await player(page);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 80, sy, { steps: 4 });
  await page.waitForTimeout(1200);
  const moving = await player(page);
  expect(moving.x - p0.x).toBeGreaterThan(0.3);
  await page.mouse.up();
  // Glide: still moving right shortly after release (inertia, no dead stop).
  await page.waitForTimeout(150);
  const gliding = await player(page);
  expect(gliding.vx).toBeGreaterThan(0.5);
});
