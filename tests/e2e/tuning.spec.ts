import { test, expect, type Page } from '@playwright/test';

const tuningGet = (page: Page, path: string): Promise<number> =>
  page.evaluate((p) => (window as any).__PATINS__.tuning.get(p) as number, path);

async function enableTuningAndPlay(page: Page): Promise<void> {
  await page.click('#btn-settings');
  await page.click('#tuning-on');
  await expect(page.locator('#tuning-on')).toHaveClass(/selected/);
  await page.click('#btn-back');
  await page.click('#btn-play');
  await expect(page.locator('#btn-tuning')).toBeVisible();
}

test('tuning mode: change a value on the phone, it persists, only changed values are stored, reset all', async ({ page }) => {
  await page.goto('./?quality=low');
  await expect(page.locator('#btn-tuning')).toBeHidden();
  await enableTuningAndPlay(page);

  await page.click('#btn-tuning');
  const panel = page.locator('#tuning-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('h2')).toHaveText('Afinació');

  const row = panel.locator('.tp-row[data-path="skating.maxSpeed"]');
  await expect(row.locator('.tp-label')).toHaveText('Velocitat màxima');
  await expect(row.locator('.tp-value')).toHaveText('8.4 m/s');
  await row.locator('.tp-step', { hasText: '+' }).click();
  await row.locator('.tp-step', { hasText: '+' }).click();
  await expect(row.locator('.tp-value')).toHaveText('8.6 m/s');
  await expect(row).toHaveClass(/modified/);
  await expect(row.locator('.tp-factory')).toHaveText('fàbrica: 8.4 m/s');
  expect(await tuningGet(page, 'skating.maxSpeed')).toBeCloseTo(8.6, 6);
  await expect(page.locator('#tuning-chip')).toHaveText('1 modificats');

  // Degrees are shown for angles but stored in radians.
  const fovRow = panel.locator('.tp-row[data-path="cameraTv.fov"]');
  await panel.locator('summary', { hasText: /^Càmera TV$/ }).click();
  await fovRow.locator('.tp-step', { hasText: '−' }).click();
  expect(await tuningGet(page, 'cameraTv.fov')).toBeCloseTo((33 * Math.PI) / 180, 6);

  // Copy values: clipboard or the manual-copy fallback, both contain the changes.
  await page.click('#tp-copy');
  await expect(panel.locator('.tp-status')).not.toBeEmpty();
  const copied = await page.evaluate(async () => {
    const box = document.querySelector<HTMLTextAreaElement>('.tp-copybox')!;
    if (!box.hidden) return box.value;
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  });
  if (copied) expect(copied).toContain('skating.maxSpeed = 8.6 (default 8.4)');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('patins.tuning.v1')!));
  expect(Object.keys(stored).sort()).toEqual(['cameraTv.fov', 'skating.maxSpeed']);

  await page.reload();
  expect(await tuningGet(page, 'skating.maxSpeed')).toBeCloseTo(8.6, 6);

  await page.click('#btn-play');
  await page.click('#btn-tuning');
  page.once('dialog', (d) => void d.accept());
  await page.click('#tp-reset-all');
  await expect(page.locator('#tuning-chip')).toBeHidden();
  expect(await tuningGet(page, 'skating.maxSpeed')).toBe(8.4);
  expect(await page.evaluate(() => localStorage.getItem('patins.tuning.v1'))).toBeNull();
});

test('a saved value whose factory default changed is dropped with a notice', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'patins.tuning.v1',
      JSON.stringify({
        'skating.maxSpeed': { v: 9, base: 7.0 }, // factory was 7.0 when changed → now 8.4: stale
        'skating.accel': { v: 12, base: 11.2 }, // still valid
      }),
    );
  });
  await page.goto('./?quality=low');
  const notice = page.locator('#stale-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Velocitat màxima');
  await expect(notice).not.toContainText('Acceleració inicial');
  expect(await tuningGet(page, 'skating.maxSpeed')).toBe(8.4);
  expect(await tuningGet(page, 'skating.accel')).toBe(12);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('patins.tuning.v1')!));
  expect(Object.keys(stored)).toEqual(['skating.accel']);
  await page.click('#stale-notice-ok');
  await expect(notice).toHaveCount(0);
});

test('Sí/No switch in the panel (trencada "only with sprint")', async ({ page }) => {
  await page.goto('./?quality=low&debug=1');
  await page.click('#btn-play');
  await page.click('#btn-tuning');
  const panel = page.locator('#tuning-panel');
  await panel.locator('summary', { hasText: 'Patinatge: trencada' }).click();
  const row = panel.locator('.tp-row[data-path="cut.onlyWithSprint"]');
  await expect(row.locator('.tp-label')).toHaveText('Només amb esprint');
  await expect(row.locator('[data-on="false"]')).toHaveClass(/selected/);
  await row.locator('[data-on="true"]').click();
  await expect(row.locator('[data-on="true"]')).toHaveClass(/selected/);
  await expect(row).toHaveClass(/modified/);
  expect(await page.evaluate(() => (window as any).__PATINS__.tuning.get('cut.onlyWithSprint'))).toBe(1);
  await expect(row.locator('.tp-factory')).toHaveText('fàbrica: No');
});
