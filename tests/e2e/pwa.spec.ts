import { test, expect } from '@playwright/test';

test('is installable: manifest + active service worker', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = (await (await request.get(href!)).json()) as Record<string, unknown>;
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.orientation).toBe('landscape');
  expect((manifest.icons as unknown[]).length).toBeGreaterThanOrEqual(2);

  const swActive = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active !== null;
  });
  expect(swActive).toBe(true);
});
