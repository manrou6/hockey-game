import { test, expect, type Page } from '@playwright/test';

// F1.5d: remate en el aire. A ball in the air comes to the controlled player's stick: TIR lights
// up (its arc fills up to the good moment) and a tap of TIR strikes it in the air.

/** Throw a slow ball in the air at the controlled player's blade (it gets there in ~0.6 s). */
async function throwAtPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__PATINS__.game;
    const w = g.world;
    const p = w.players[w.controlled];
    p.vx = p.vy = 0;
    const h = p.heading;
    const bx = p.x + Math.cos(h) * 0.55 + Math.sin(h) * 0.14;
    const by = p.y + Math.sin(h) * 0.55 - Math.cos(h) * 0.14;
    const speed = 6;
    const t = 0.6;
    const b = w.ball;
    b.owner = -1;
    b.x = b.prevX = bx + Math.cos(h) * speed * t;
    b.y = b.prevY = by + Math.sin(h) * speed * t;
    b.z = b.prevZ = 0.0365 + 0.5;
    b.vx = -Math.cos(h) * speed;
    b.vy = -Math.sin(h) * speed;
    b.vz = (9.81 * t) / 2;
    w.passTo = w.controlled;
    w.meetX = bx;
    w.meetY = by;
    p.noPickupTicks = 0;
  });
}

const lastShot = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    return { tick: w.lastShotTick as number, aerial: w.lastShot.aerial as boolean, timing: w.lastShot.timing as number };
  });

test('remate en el aire: TIR lights up while a ball in the air comes and a tap strikes it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  await page.waitForTimeout(800);
  const btn = page.locator('#btn-shoot');
  const before = (await lastShot(page)).tick;
  await throwAtPlayer(page);
  await expect(btn).toHaveClass(/volley/, { timeout: 3_000 });
  // Tap TIR as soon as the button flashes (the good moment).
  await page.waitForSelector('#btn-shoot.volley-good', { timeout: 3_000 });
  const box = (await btn.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await btn.dispatchEvent('pointerdown', { pointerId: 9, isPrimary: false, clientX: x, clientY: y });
  await btn.dispatchEvent('pointerup', { pointerId: 9, isPrimary: false, clientX: x, clientY: y });
  await expect.poll(async () => (await lastShot(page)).tick, { timeout: 3_000 }).not.toBe(before);
  const s = await lastShot(page);
  expect(s.aerial).toBe(true);
  expect(Math.abs(s.timing)).toBeLessThanOrEqual(0.2 + 1e-6);
  await expect(btn).not.toHaveClass(/volley/);
  // Once more without striking, for the picture of the lit button.
  await page.waitForTimeout(1500);
  await throwAtPlayer(page);
  await expect(btn).toHaveClass(/volley/, { timeout: 3_000 });
  await page.screenshot({ path: 'test-results/screenshots/f1-volley-window.png' });
  expect(errors).toEqual([]);
});
