import { test, expect, type Page } from '@playwright/test';

const PRESETS = ['tv', 'close', 'tactical'] as const;

type Rect = { x: number; y: number; width: number; height: number };
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function placeAndSettle(page: Page, px: number, py: number): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const w = (window as any).__PATINS__.game.world;
    const p = w.players[0];
    p.x = p.prevX = x;
    p.y = p.prevY = y;
    p.vx = p.vy = 0;
    const b = w.ball;
    b.x = b.prevX = x + 0.6;
    b.y = b.prevY = y;
    b.vx = b.vy = b.vz = 0;
  }, { x: px, y: py });
  await page.waitForTimeout(3500);
}

test('camera button cycles TV → close → tactical, is remembered, and matches Settings', async ({ page }) => {
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  const btn = page.locator('#btn-camera');
  await expect(btn).toHaveText('🎥 TV');
  await btn.click();
  await expect(btn).toHaveText('🎥 Propera');
  expect(await page.evaluate(() => (window as any).__PATINS__.renderer.cameraRig.preset)).toBe('close');
  await btn.click();
  await expect(btn).toHaveText('🎥 Tàctica');

  await page.reload();
  await expect(page.locator('#btn-camera')).toHaveText('🎥 Tàctica');
  await page.click('#btn-settings');
  await expect(page.locator('#camera-tactical')).toHaveClass(/selected/);
  await page.click('#camera-tv');
  await page.click('#btn-back');
  await page.click('#btn-play');
  await expect(page.locator('#btn-camera')).toHaveText('🎥 TV');
});

test('HUD buttons never overlap each other or the thumb controls', async ({ page }) => {
  await page.goto('./?quality=low');
  await page.click('#btn-settings');
  await page.click('#tuning-on');
  await page.click('#btn-back');
  await page.click('#btn-play');
  // Make the "modified" chip appear too.
  await page.evaluate(() => (window as any).__PATINS__.tuning.set('skating.maxSpeed', 8));
  for (const label of ['🎥 TV', '🎥 Propera', '🎥 Tàctica']) {
    await expect(page.locator('#btn-camera')).toHaveText(label);
    const ids = ['#btn-pause', '#btn-tuning', '#btn-camera', '#tuning-chip', '#btn-pass', '#btn-shoot', '#btn-dribble', '.joy-base'];
    const rects: Rect[] = [];
    for (const id of ids) rects.push((await page.locator(id).boundingBox())!);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!), `${ids[i]} vs ${ids[j]}`).toBe(false);
    }
    await page.click('#btn-camera');
  }
});

for (const preset of PRESETS) {
  test(`${preset} camera keeps the player and ball clear of the joystick and buttons`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./?quality=low');
    await page.evaluate((p) => localStorage.setItem('patins.settings.v1', JSON.stringify({ camera: p })), preset);
    await page.reload();
    await page.click('#btn-play');
    const controls: Rect[] = [];
    for (const id of ['#btn-pass', '#btn-shoot', '#btn-dribble', '.joy-base', '#btn-pause', '#btn-camera']) controls.push((await page.locator(id).boundingBox())!);
    const vp = page.viewportSize()!;
    for (const [x, y] of [[0, 0], [0, -8], [0, 8], [-15, -7], [15, -7], [-15, 7], [15, 7], [18.8, 0]] as const) {
      await placeAndSettle(page, x, y);
      const pts = await page.evaluate(() => {
        const g = (window as any).__PATINS__;
        const w = g.game.world;
        const r = g.renderer;
        return [r.projectToScreen(w.players[0].x, 0.9, w.players[0].y), r.projectToScreen(w.ball.x, 0.04, w.ball.y)];
      });
      for (const pt of pts) {
        expect(pt.x, `(${x},${y}) on screen x`).toBeGreaterThan(0);
        expect(pt.x).toBeLessThan(vp.width);
        expect(pt.y, `(${x},${y}) on screen y`).toBeGreaterThan(0);
        expect(pt.y).toBeLessThan(vp.height);
        const hit = controls.some((c) => pt.x > c.x && pt.x < c.x + c.width && pt.y > c.y && pt.y < c.y + c.height);
        expect(hit, `${preset}: player/ball at (${x},${y}) under a control (${pt.x.toFixed(0)},${pt.y.toFixed(0)})`).toBe(false);
      }
    }
    await page.screenshot({ path: `test-results/screenshots/f1-camera-${preset}.png` });
  });
}

test('ball size is compensated by camera distance and each camera has its own multiplier', async ({ page }) => {
  test.setTimeout(120_000);
  const scaleIn = async (preset: string): Promise<number> => {
    await page.evaluate((p) => localStorage.setItem('patins.settings.v1', JSON.stringify({ camera: p })), preset);
    await page.reload();
    await page.click('#btn-play');
    await page.waitForTimeout(2500);
    return page.evaluate(() => (window as any).__PATINS__.renderer.ballVisualScale as number);
  };
  await page.goto('./?quality=low');
  const tv = await scaleIn('tv');
  const tactical = await scaleIn('tactical');
  const close = await scaleIn('close');
  expect(tactical).toBeGreaterThan(tv * 1.3);
  expect(close).toBeGreaterThanOrEqual(1);
  // Per-camera multiplier from the tuning panel applies live.
  await page.evaluate(() => (window as any).__PATINS__.tuning.set('cameraClose.ballScale', 3));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__PATINS__.renderer.ballVisualScale as number)).toBeGreaterThan(close * 1.4);
});
