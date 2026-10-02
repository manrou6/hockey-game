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
  await page.waitForTimeout(1500);
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
  await page.keyboard.up('KeyD');

  // Put the ball back on the stick and shoot with the on-screen TIRO button.
  await page.evaluate(() => {
    const g = (window as any).__PATINS__.game.world;
    const p = g.players[0];
    const b = g.ball;
    p.x = p.prevX = -5; p.y = p.prevY = 0; p.heading = p.prevHeading = 0; p.vx = p.vy = 0;
    b.x = b.prevX = -4.45; b.y = b.prevY = -0.14; b.vx = b.vy = b.vz = 0; b.z = b.prevZ = 0.0366; b.owner = -1; b.inGoal = 0; b.scored = false;
  });
  await expect.poll(async () => (await world(page)).owner, { timeout: 10_000 }).toBe(0);
  await page.locator('#btn-shoot').dispatchEvent('pointerdown', { pointerId: 7, isPrimary: false });
  await page.locator('#btn-shoot').dispatchEvent('pointerup', { pointerId: 7, isPrimary: false });
  await expect.poll(async () => (await world(page)).owner, { timeout: 10_000 }).toBe(-1);
  expect(errors).toEqual([]);
});

test('holding REGATE sprints; a short tap does not', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const btn = page.locator('#btn-dribble');
  const sprintCmd = () => page.evaluate(() => (window as any).__PATINS__.game.commands[0].sprint as boolean);
  await btn.dispatchEvent('pointerdown', { pointerId: 3, isPrimary: false });
  await expect.poll(sprintCmd, { timeout: 5000 }).toBe(true);
  await btn.dispatchEvent('pointerup', { pointerId: 3, isPrimary: false });
  await expect.poll(sprintCmd, { timeout: 5000 }).toBe(false);
});
