// Rasterizes public/icons/icon.svg into the PNG sizes the PWA manifest needs.
// Run once when the icon changes: `node scripts/gen-icons.mjs` (uses Playwright's Chromium).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf-8');
const sizes = [
  { name: 'icon-192.png', size: 192, scale: 1 },
  { name: 'icon-512.png', size: 512, scale: 1 },
  // Maskable: keep the artwork inside the central 80% safe zone.
  { name: 'icon-maskable-512.png', size: 512, scale: 0.8 },
  { name: 'apple-touch-icon.png', size: 180, scale: 1 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { name, size, scale } of sizes) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(
    `<html><body style="margin:0;background:#0b1d33;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
}
await browser.close();
console.log('icons generated');
