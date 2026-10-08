import { test, expect, type Page } from '@playwright/test';

// F1.5a: TIRO (quick / charged, height by the diagonal drag, reticle on the goal).

const state = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__PATINS__;
    const w = p.game.world;
    return {
      owner: w.ball.owner as number,
      ballX: w.ball.x as number,
      lastShotTick: w.lastShotTick as number,
      lastShotKind: w.lastShot.kind as number,
      lastShotSpeed: w.lastShot.speed as number,
      reticle: p.renderer.shotReticleKind as number,
    };
  });

async function takeBallNearGoal(page: Page): Promise<void> {
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await state(page)).owner, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => (await state(page)).ballX, { timeout: 30_000 }).toBeGreaterThan(4);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(400);
}

test('TIR: the reticle shows near the goal; holding fills the arc, the diagonal drag picks the height, it leaves on release', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  await takeBallNearGoal(page);
  expect((await state(page)).owner).toBe(0);
  await expect.poll(async () => (await state(page)).reticle, { timeout: 5_000 }).toBe(0); // low (white) while carrying
  const before = (await state(page)).lastShotTick;

  const btn = page.locator('#btn-shoot');
  const box = (await btn.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await btn.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: false, clientX: x, clientY: y });
  await expect(btn).toHaveClass(/charging/);
  expect((await state(page)).owner).toBe(0); // the ball stays on the stick while charging
  await btn.dispatchEvent('pointermove', { pointerId: 7, isPrimary: false, clientX: x + 45, clientY: y - 45 });
  await expect(btn).toHaveClass(/drive/);
  await expect.poll(async () => (await state(page)).reticle, { timeout: 5_000 }).toBe(1); // high (orange)
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/f1-shot-charge.png' });
  await btn.dispatchEvent('pointerup', { pointerId: 7, isPrimary: false, clientX: x + 45, clientY: y - 45 });
  await expect.poll(async () => (await state(page)).lastShotTick, { timeout: 5_000 }).not.toBe(before);
  const s = await state(page);
  expect(s.lastShotKind).toBe(1);
  expect(s.lastShotSpeed).toBeGreaterThan(15);
  await expect(btn).not.toHaveClass(/charging/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screenshots/f1-shot-after.png' });
  expect(errors).toEqual([]);
});

test('TIR on the keyboard: K tapped = quick low shot; the reticle can be switched off in Settings', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?quality=low');
  await page.click('#btn-settings');
  await page.click('#reticle-off');
  await page.click('#btn-back');
  await page.click('#btn-play');
  await takeBallNearGoal(page);
  await page.waitForTimeout(300);
  expect((await state(page)).reticle).toBe(-1);
  const before = (await state(page)).lastShotTick;
  await page.keyboard.press('KeyK');
  await expect.poll(async () => (await state(page)).lastShotTick, { timeout: 5_000 }).not.toBe(before);
  const s = await state(page);
  expect(s.lastShotKind).toBe(0);
});
