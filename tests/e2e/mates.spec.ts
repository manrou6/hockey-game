import { test, expect, type Page } from '@playwright/test';

const state = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    return { owner: w.ball.owner as number, controlled: w.controlled as number, players: w.players.length as number };
  });

test('two teammates; a pass gives the control to the receiver (FIFA-like) and he gets the ball', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  expect((await state(page)).players).toBe(3);
  expect((await state(page)).controlled).toBe(0);

  // Take the ball, stop, and let the teammates take their support spots (ahead and to the sides).
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await state(page)).owner, { timeout: 30_000 }).toBe(0);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/f1-mates.png' });

  // Pass up-right (W + D + J) to the teammate on that side.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(50);
  await page.keyboard.press('KeyJ');
  await expect.poll(async () => (await state(page)).controlled, { timeout: 5_000 }).not.toBe(0);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  const receiver = (await state(page)).controlled;
  await expect.poll(async () => (await state(page)).owner, { timeout: 15_000 }).toBe(receiver);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screenshots/f1-mates-switched.png' });
  expect(errors).toEqual([]);
});

test('PASSADA: holding fills the arc (power); sliding up turns it orange (driven) then purple (lob); it leaves on release', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await state(page)).owner, { timeout: 30_000 }).toBe(0);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(1500);
  // The ring marks who the pass would go to (aiming up-right at a teammate).
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => (window as any).__PATINS__.game.world.aimTarget as number), { timeout: 5_000 }).toBeGreaterThan(0);

  const btn = page.locator('#btn-pass');
  const box = (await btn.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await btn.dispatchEvent('pointerdown', { pointerId: 9, isPrimary: false, clientX: x, clientY: y });
  await expect(btn).toHaveClass(/charging/);
  await expect(btn).not.toHaveClass(/drive|lob/); // no slide: low pass (white)
  expect((await state(page)).owner).toBe(0); // nothing leaves while held
  await btn.dispatchEvent('pointermove', { pointerId: 9, isPrimary: false, clientX: x, clientY: y - 75 });
  await expect(btn).toHaveClass(/drive/);
  await page.screenshot({ path: 'test-results/screenshots/f1-pass-charge.png' });
  await btn.dispatchEvent('pointermove', { pointerId: 9, isPrimary: false, clientX: x, clientY: y - 140 });
  await expect(btn).toHaveClass(/lob/);
  await expect(btn).not.toHaveClass(/drive/);
  await page.screenshot({ path: 'test-results/screenshots/f1-pass-charge-lob.png' });
  await btn.dispatchEvent('pointerup', { pointerId: 9, isPrimary: false, clientX: x, clientY: y - 140 });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  await expect.poll(async () => (await state(page)).owner, { timeout: 5_000 }).not.toBe(0);
  await expect(btn).not.toHaveClass(/charging/);
  const kind = await page.evaluate(() => (window as any).__PATINS__.game.world.passKind as number);
  expect(kind).toBe(2); // lob
});

test('keyboard: J passes low, J with U held passes a driven lofted pass', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await state(page)).owner, { timeout: 30_000 }).toBe(0);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyU');
  await page.keyboard.press('KeyJ');
  await page.keyboard.up('KeyU');
  await expect.poll(async () => (await state(page)).owner, { timeout: 5_000 }).not.toBe(0);
  expect(await page.evaluate(() => (window as any).__PATINS__.game.world.passKind as number)).toBe(1);
});

test('CANVI button: switches to the teammate nearest the ball', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const btn = page.locator('#btn-switch');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('Canvi');
  // Put the ball (loose, still) next to teammate #1 (index 1).
  await page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    const m = w.players[1];
    w.ball.owner = -1;
    w.ball.x = w.ball.prevX = m.x + 1;
    w.ball.y = w.ball.prevY = m.y;
    w.ball.vx = w.ball.vy = w.ball.vz = 0;
  });
  await btn.dispatchEvent('pointerdown', { pointerId: 21, isPrimary: false });
  await btn.dispatchEvent('pointerup', { pointerId: 21, isPrimary: false });
  await expect.poll(async () => (await state(page)).controlled, { timeout: 5_000 }).toBe(1);
  await page.screenshot({ path: 'test-results/screenshots/f1-switch.png' });
});

test('pass assist level is chosen in Settings (Lleugera by default) and remembered', async ({ page }) => {
  await page.goto('./');
  await page.click('#btn-settings');
  await expect(page.locator('#assist-light')).toHaveClass(/selected/);
  await page.click('#assist-strong');
  await expect(page.locator('#assist-strong')).toHaveClass(/selected/);
  expect(await page.evaluate(() => (window as any).__PATINS__.game.world.assist)).toBe('strong');
  await page.reload();
  expect(await page.evaluate(() => (window as any).__PATINS__.game.world.assist)).toBe('strong');
  await page.click('#btn-settings');
  await expect(page.locator('#assist-strong')).toHaveClass(/selected/);
  await page.screenshot({ path: 'test-results/screenshots/f1-settings-assist.png' });
});

test('pass arrow: shown while PASSADA is held (grows with power, white → orange when sliding up), fades after, and can be switched off', async ({ page }) => {
  test.setTimeout(120_000);
  const arrow = () => page.evaluate(() => (window as any).__PATINS__.renderer.passArrowState as { visible: boolean; r: number; g: number; b: number; length: number });
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await state(page)).owner, { timeout: 30_000 }).toBe(0);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(1000);
  expect((await arrow()).visible).toBe(false);

  const btn = page.locator('#btn-pass');
  const box = (await btn.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await btn.dispatchEvent('pointerdown', { pointerId: 11, isPrimary: false, clientX: x, clientY: y });
  await expect.poll(async () => (await arrow()).visible, { timeout: 5_000 }).toBe(true);
  const white = await arrow();
  expect(white.b).toBeGreaterThan(0.9); // white: low pass
  // Holding charges the power: the arrow grows.
  await expect.poll(async () => (await arrow()).length, { timeout: 5_000 }).toBeGreaterThan(white.length + 0.5);
  await btn.dispatchEvent('pointermove', { pointerId: 11, isPrimary: false, clientX: x, clientY: y - 75 });
  await expect.poll(async () => (await arrow()).b, { timeout: 5_000 }).toBeLessThan(0.5); // orange: driven lofted
  await page.screenshot({ path: 'test-results/screenshots/f1-pass-arrow.png' });
  await btn.dispatchEvent('pointerup', { pointerId: 11, isPrimary: false, clientX: x, clientY: y - 75 });
  await expect.poll(async () => (await state(page)).owner, { timeout: 5_000 }).not.toBe(0);
  // It fades away shortly after the pass.
  await expect.poll(async () => (await arrow()).visible, { timeout: 5_000 }).toBe(false);

  // Switch it off in Settings: no arrow while holding.
  await page.click('#btn-pause');
  await page.click('#btn-settings');
  await expect(page.locator('#arrow-on')).toHaveClass(/selected/);
  await page.click('#arrow-off');
  await page.click('#btn-back');
  await page.click('#btn-play');
  // Give the controlled player the ball again (test shortcut).
  await page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    w.ball.owner = w.controlled;
    w.ball.z = 0.0366;
    w.ball.vz = 0;
  });
  await btn.dispatchEvent('pointerdown', { pointerId: 12, isPrimary: false });
  await page.waitForTimeout(400);
  expect((await arrow()).visible).toBe(false);
  await btn.dispatchEvent('pointerup', { pointerId: 12, isPrimary: false });
});
