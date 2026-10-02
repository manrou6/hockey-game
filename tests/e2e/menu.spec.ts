import { test, expect } from '@playwright/test';
import pkg from '../../package.json' with { type: 'json' };

test('menu defaults to Catalan, settings switch language and persist, version is shown', async ({ page }) => {
  await page.goto('./?quality=low');
  await expect(page.locator('#btn-play')).toHaveText('Jugar');
  await expect(page.locator('#btn-settings')).toHaveText('Configuració');

  await page.click('#btn-settings');
  await expect(page.locator('#settings-screen')).toBeVisible();
  await expect(page.locator('#version-label')).toContainText(`v${pkg.version}`);
  await expect(page.locator('#lang-ca')).toHaveClass(/selected/);

  await page.click('#lang-es');
  await expect(page.locator('#settings-screen h2')).toHaveText('Ajustes');
  await page.click('#lang-en');
  await expect(page.locator('#settings-screen h2')).toHaveText('Settings');
  await expect(page.locator('#version-label')).toContainText('Version');

  await page.reload();
  await expect(page.locator('#btn-settings')).toHaveText('Settings');
});

test('pause button returns to the menu and freezes the simulation', async ({ page }) => {
  await page.goto('./?quality=low');
  const tick = () => page.evaluate(() => (window as any).__PATINS__.game.world.tick as number);
  const t0 = await tick();
  await page.waitForTimeout(500);
  expect(await tick()).toBe(t0); // paused behind the main menu

  await page.click('#btn-play');
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(800);
  expect(await tick()).toBeGreaterThan(t0);

  await page.click('#btn-pause');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#btn-play')).toHaveText('Continuar');
  const t1 = await tick();
  await page.waitForTimeout(500);
  expect(await tick()).toBe(t1);
});

test('changing graphics quality applies immediately without reloading the page', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => ((window as any).__noReloadMarker = 42));
  await page.click('#btn-settings');
  await expect(page.locator('#quality-medium')).toHaveClass(/selected/);
  await page.click('#quality-low');
  await expect(page.locator('#quality-low')).toHaveClass(/selected/);
  await page.click('#quality-high');
  await expect(page.locator('#quality-high')).toHaveClass(/selected/);
  await expect(page.locator('#settings-screen')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__noReloadMarker)).toBe(42);
});
