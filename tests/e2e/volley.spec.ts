import { test, expect, type Page } from '@playwright/test';

// F1.5d / F1.5e: remate en el aire. A ball in the air comes to the controlled player's stick: TIR lights
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

/** The ball is back in play (free play puts it back at the centre ~1.5 s of sim time after a goal). */
const ballInPlay = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    return w.ballResetTicks === 0 && !w.ball.scored && w.ball.inGoal === 0;
  });

const lastShot = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__PATINS__.game.world;
    return { tick: w.lastShotTick as number, aerial: w.lastShot.aerial as boolean, timing: w.lastShot.timing as number };
  });

/**
 * Watch TIR from inside the page, in the very frame its classes change: the lit button lasts only
 * ~0.2 s of sim time, and in headless Chromium the sim can run well below real time (slow frames,
 * capped catch-up), so polling from the test or tapping after a round trip can miss it. Notes when
 * it lights up and, at the good moment, taps it there and then.
 */
async function watchVolley(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = document.getElementById('btn-shoot')!;
    const seen = ((window as any).__volleySeen = { volley: false, good: false });
    const observer = new MutationObserver(() => {
      if (btn.classList.contains('volley')) seen.volley = true;
      if (seen.good || !btn.classList.contains('volley-good')) return;
      seen.good = true;
      observer.disconnect();
      const r = btn.getBoundingClientRect();
      const at = { pointerId: 9, isPrimary: false, bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      btn.dispatchEvent(new PointerEvent('pointerdown', at));
      btn.dispatchEvent(new PointerEvent('pointerup', at));
    });
    observer.observe(btn, { attributes: true, attributeFilter: ['class'] });
  });
}

const volleySeen = (page: Page) => page.evaluate(() => (window as any).__volleySeen as { volley: boolean; good: boolean });

/**
 * The slow-mo of the volley window (F1.5e), seen frame by frame (after the HUD has updated): the
 * lowest time scale so far, the gold halo on the ball (v0.1.29) seen while TIR is lit, and the game
 * frozen the first frame it is slowed down with TIR lit.
 */
async function watchSlowMo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = document.getElementById('btn-shoot')!;
    const game = (window as any).__PATINS__.game;
    const halo = (window as any).__PATINS__.renderer.volleyHalo;
    const slow = ((window as any).__slowSeen = { min: 1, frozen: false, halo: false, active: true });
    game.onFrame(() => {
      if (!slow.active) return;
      slow.min = Math.min(slow.min, game.slowMo.scale);
      if (halo.isVisible && btn.classList.contains('volley')) slow.halo = true;
      if (game.slowMo.scale < 1 && btn.classList.contains('volley')) {
        slow.frozen = true;
        slow.active = false;
        game.paused = true;
      }
    });
  });
}

const slowSeen = (page: Page) => page.evaluate(() => (window as any).__slowSeen as { min: number; frozen: boolean; halo: boolean });

test('remate en el aire: TIR and a gold halo on the ball light up while a ball in the air comes, the game slows down and a tap strikes it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low');
  await page.click('#btn-play');
  await page.waitForTimeout(800);
  const btn = page.locator('#btn-shoot');
  const before = (await lastShot(page)).tick;
  // TIR lights up, then flashes at the good moment; a tap right then strikes the ball in the air.
  await watchVolley(page);
  await throwAtPlayer(page);
  await expect.poll(() => volleySeen(page), { timeout: 15_000 }).toEqual({ volley: true, good: true });
  await expect.poll(async () => (await lastShot(page)).tick, { timeout: 15_000 }).not.toBe(before);
  const s = await lastShot(page);
  expect(s.aerial).toBe(true);
  expect(Math.abs(s.timing)).toBeLessThanOrEqual(0.2 + 1e-6);
  await expect(btn).not.toHaveClass(/volley/);
  // Once more without striking (after a goal, once the ball is back): the game slows down while it
  // comes (slow-mo on by default), frozen then for the picture of the lit button.
  await expect.poll(() => ballInPlay(page), { timeout: 15_000 }).toBe(true);
  await watchSlowMo(page);
  await throwAtPlayer(page);
  await expect.poll(async () => (await slowSeen(page)).min, { timeout: 15_000 }).toBeLessThan(1);
  if ((await slowSeen(page)).frozen) await expect(btn).toHaveClass(/volley/);
  // The cue on the ball (v0.1.29): the halo is drawn while TIR is lit.
  await expect.poll(async () => (await slowSeen(page)).halo, { timeout: 15_000 }).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/f1-volley-window.png' });
  await page.evaluate(() => {
    (window as any).__PATINS__.game.paused = false;
  });
  expect(errors).toEqual([]);
});
