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
  // F1.4c: the reception was rolled (clean or heavy touch, since he has it).
  const rec = await page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    return { player: w.lastReceptionPlayer as number, outcome: w.lastReceptionOutcome as number };
  });
  expect(rec.player).toBe(receiver);
  expect(rec.outcome).toBeLessThanOrEqual(1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screenshots/f1-mates-switched.png' });
  expect(errors).toEqual([]);
});

test('PASSADA: holding fills the arc (power); dragging up-right turns it orange (driven), up-left purple (lob); it leaves on release', async ({ page }) => {
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
  await btn.dispatchEvent('pointermove', { pointerId: 9, isPrimary: false, clientX: x + 45, clientY: y - 45 });
  await expect(btn).toHaveClass(/drive/);
  await page.screenshot({ path: 'test-results/screenshots/f1-pass-charge.png' });
  await btn.dispatchEvent('pointermove', { pointerId: 9, isPrimary: false, clientX: x - 45, clientY: y - 45 });
  await expect(btn).toHaveClass(/lob/);
  await expect(btn).not.toHaveClass(/drive/);
  await page.screenshot({ path: 'test-results/screenshots/f1-pass-charge-lob.png' });
  await btn.dispatchEvent('pointerup', { pointerId: 9, isPrimary: false, clientX: x - 45, clientY: y - 45 });
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

test('pass assist: 4 levels in Settings, Mitjana by default, the choice is remembered', async ({ page }) => {
  await page.goto('./');
  await page.click('#btn-settings');
  for (const id of ['off', 'light', 'medium', 'strong']) await expect(page.locator(`#assist-${id}`)).toBeVisible();
  await expect(page.locator('#assist-medium')).toHaveClass(/selected/);
  expect(await page.evaluate(() => (window as any).__PATINS__.game.world.assist)).toBe('medium');
  await page.click('#assist-strong');
  await expect(page.locator('#assist-strong')).toHaveClass(/selected/);
  expect(await page.evaluate(() => (window as any).__PATINS__.game.world.assist)).toBe('strong');
  await page.reload();
  expect(await page.evaluate(() => (window as any).__PATINS__.game.world.assist)).toBe('strong');
  await page.click('#btn-settings');
  await expect(page.locator('#assist-strong')).toHaveClass(/selected/);
  await page.screenshot({ path: 'test-results/screenshots/f1-settings-assist.png' });
});

test('pass arrow: shown while PASSADA is held (grows with power, white → orange when dragging up-right), fades after, and can be switched off', async ({ page }) => {
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
  await btn.dispatchEvent('pointermove', { pointerId: 11, isPrimary: false, clientX: x + 45, clientY: y - 45 });
  await expect.poll(async () => (await arrow()).b, { timeout: 5_000 }).toBeLessThan(0.5); // orange: driven lofted
  await page.screenshot({ path: 'test-results/screenshots/f1-pass-arrow.png' });
  await btn.dispatchEvent('pointerup', { pointerId: 11, isPrimary: false, clientX: x + 45, clientY: y - 45 });
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

test('reception ring: a short coloured ring shows how the reception went (orange = rebound)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const feedback = () => page.evaluate(() => (window as any).__PATINS__.renderer.receptionFeedback as number);
  await page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    w.lastReceptionTick = w.tick;
    w.lastReceptionPlayer = 1;
    w.lastReceptionOutcome = 2;
  });
  await expect.poll(feedback, { timeout: 2_000 }).toBe(2);
  await page.screenshot({ path: 'test-results/screenshots/f1-reception-ring.png' });
  await expect.poll(feedback, { timeout: 3_000 }).toBe(-1);
});

test('PASSADA with a REAL touch (not synthetic events): up-right drag = driven, up-left = lob, straight up = low', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const cdp = await page.context().newCDPSession(page);
  const btn = page.locator('#btn-pass');
  const box = (await btn.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const height = () => page.evaluate(() => (window as any).__PATINS__.game.commands[0].passHeight as number);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', px?: number, py?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px!, y: py! }] });
  for (const [dx, dy, expected] of [[35, -35, 1], [-35, -35, 2], [0, -70, 0], [12, -50, 0]] as const) {
    await touch('touchStart', x, y);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', x + (dx * i) / 8, y + (dy * i) / 8);
      await page.waitForTimeout(16);
    }
    await expect.poll(height, { timeout: 2_000 }).toBe(expected);
    await touch('touchEnd');
    await page.waitForTimeout(100);
  }
});

test('wall pass markers: rings on the floor where the ball hits the board and where he meets it, until it is back (the flow itself is in the unit tests)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const markers = () => page.evaluate(() => (window as any).__PATINS__.renderer.wallMarkersVisible as boolean);
  expect(await markers()).toBe(false);
  await page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    w.ball.owner = -1;
    w.ball.x = w.ball.prevX = -3;
    w.ball.y = w.ball.prevY = 4;
    w.ball.vx = w.ball.vy = w.ball.vz = 0;
    w.wallFrom = 0; // a wall pass on its way to the board
    w.wallX = 0;
    w.wallY = 9.9;
    w.meetX = 8;
    w.meetY = 0;
  });
  await expect.poll(markers, { timeout: 3_000 }).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/f1-wall-pass-markers.png' });
  await page.evaluate(() => {
    (window as any).__PATINS__.tuning.set('wall.showMarkers', 0);
  });
  await expect.poll(markers, { timeout: 3_000 }).toBe(false);
  await page.evaluate(() => {
    const P = (window as any).__PATINS__;
    P.tuning.set('wall.showMarkers', 1);
    P.game.world.wallFrom = -1; // it is over
  });
  await expect.poll(markers, { timeout: 3_000 }).toBe(false);
});
