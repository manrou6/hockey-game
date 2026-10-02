import { test, expect, type Page } from '@playwright/test';

const world = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    return {
      owner: w.ball.owner as number,
      bvx: w.ball.vx as number,
      bx: w.ball.x as number,
      px: w.players[0].x as number,
      scored: w.ball.scored as boolean,
      speed: Math.hypot(w.players[0].vx, w.players[0].vy),
    };
  });

test('skate onto the ball, carry it, shoot with K and with the TIRO button', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low');
  await page.click('#btn-play');

  for (const id of ['#btn-pass', '#btn-shoot', '#btn-dribble']) await expect(page.locator(id)).toBeVisible();
  await expect(page.locator('#btn-pass')).toHaveText('Passada');
  await expect(page.locator('#btn-shoot')).toHaveText('Xut');
  await expect(page.locator('#btn-dribble')).toHaveText('Regat');

  // The ball starts just ahead of the player: skating forward picks it up.
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await world(page)).owner, { timeout: 30_000 }).toBe(0);
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD'); // stop before reaching the goal (carrying it in would score)
  await page.waitForTimeout(400);
  expect((await world(page)).owner).toBe(0); // still carrying it
  await page.screenshot({ path: 'test-results/screenshots/f1-dribble.png' });

  const before = await world(page);
  await page.keyboard.press('KeyK');
  // Headless renders slowly: check the shot went off towards the goal (fast, far or in the net).
  await expect
    .poll(async () => {
      const w = await world(page);
      return w.owner === -1 && (w.bvx > 8 || w.bx > before.bx + 4 || w.scored);
    }, { timeout: 10_000 })
    .toBe(true);

  // Put the ball back on the stick and shoot with the on-screen TIRO button.
  await page.evaluate(() => {
    const g = (window as any).__PATINS__.game.world;
    const p = g.players[0];
    const b = g.ball;
    p.x = p.prevX = -5; p.y = p.prevY = 0; p.heading = p.prevHeading = 0; p.vx = p.vy = 0; p.noPickupTicks = 0;
    g.ballResetTicks = 0; // a goal from the first shot must not send the ball back to the centre
    b.x = b.prevX = -4.45; b.y = b.prevY = -0.14; b.vx = b.vy = b.vz = 0; b.z = b.prevZ = 0.0366; b.owner = -1; b.inGoal = 0; b.scored = false;
  });

  await expect.poll(async () => (await world(page)).owner, { timeout: 10_000 }).toBe(0);
  await page.locator('#btn-shoot').dispatchEvent('pointerdown', { pointerId: 7, isPrimary: false });
  await page.locator('#btn-shoot').dispatchEvent('pointerup', { pointerId: 7, isPrimary: false });
  await expect.poll(async () => (await world(page)).owner, { timeout: 10_000 }).toBe(-1);
  expect(errors).toEqual([]);
});

test('analog joystick: further = faster, the outer zone sprints (ring lights up); REGATE never sprints', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const cmd = () => page.evaluate(() => ({ ...(window as any).__PATINS__.game.commands[0] }));
  const vp = page.viewportSize()!;
  const cx = vp.width * 0.2;
  const cy = vp.height * 0.6;
  // Radius 60 px, sprint ring at 90% = 54 px.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 25, cy, { steps: 3 });
  await expect.poll(async () => (await cmd()).moveX, { timeout: 5000 }).toBeGreaterThan(0.05);
  const slow = await cmd();
  expect(slow.sprint).toBe(false);
  expect(slow.moveX).toBeLessThan(0.5);
  await page.mouse.move(cx + 45, cy, { steps: 3 });
  await expect.poll(async () => (await cmd()).moveX, { timeout: 5000 }).toBeGreaterThan(slow.moveX + 0.2);
  expect((await cmd()).sprint).toBe(false);
  await expect(page.locator('.joy-base')).not.toHaveClass(/sprinting/);
  await page.mouse.move(cx + 60, cy, { steps: 3 });
  await expect.poll(async () => (await cmd()).sprint, { timeout: 5000 }).toBe(true);
  await expect(page.locator('.joy-base')).toHaveClass(/sprinting/);
  await expect(page.locator('.joy-sprint-ring')).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await cmd()).sprint, { timeout: 5000 }).toBe(false);

  // Holding REGATE does not sprint any more.
  const btn = page.locator('#btn-dribble');
  await btn.dispatchEvent('pointerdown', { pointerId: 3, isPrimary: false });
  await page.waitForTimeout(600);
  expect((await cmd()).sprint).toBe(false);
  await btn.dispatchEvent('pointerup', { pointerId: 3, isPrimary: false });

  // Keyboard: arrows = normal top speed, Shift = sprint.
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await cmd()).moveX, { timeout: 5000 }).toBe(1);
  expect((await cmd()).sprint).toBe(false);
  await page.keyboard.down('ShiftLeft');
  await expect.poll(async () => (await cmd()).sprint, { timeout: 5000 }).toBe(true);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyD');
});

test('buttons can be moved and resized from the tuning panel', async ({ page }) => {
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const box0 = (await page.locator('#btn-dribble').boundingBox())!;
  await page.evaluate(() => {
    const t = (window as any).__PATINS__.tuning;
    t.set('buttons.dribbleBottom', 120);
    t.set('buttons.dribbleSize', 70);
  });
  const box1 = (await page.locator('#btn-dribble').boundingBox())!;
  expect(box1.width).toBeCloseTo(70, 0);
  expect(box1.y + box1.height).toBeGreaterThan(box0.y + box0.height + 20); // lower on screen
});
