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
  await expect.poll(async () => (await player(page)).x - p0.x, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.keyboard.up('KeyD');
  const p1 = await player(page);
  expect(Math.abs(p1.y - p0.y)).toBeLessThan(0.3);

  // Let the skater stop first: a 90° key change at speed is a trencada (pre-brake first),
  // which is covered by the simulation tests.
  await expect.poll(async () => Math.hypot((await player(page)).vx, (await player(page)).vy), { timeout: 15_000 }).toBeLessThan(0.2);
  const p1b = await player(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await player(page)).y - p1b.y, { timeout: 15_000 }).toBeGreaterThan(0.3);
  await page.keyboard.up('KeyW');
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
