import { defineConfig } from '@playwright/test';

const PORT = 4173;

// Google Pixel 8a in landscape: 2400x1080 px panel, DPR 2.625 → ~914x411 CSS px.
export const PIXEL_8A_LANDSCAPE = {
  viewport: { width: 914, height: 411 },
  screen: { width: 914, height: 411 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/hockey-game/`,
    ...PIXEL_8A_LANDSCAPE,
    launchOptions: {
      // Headless Chromium has no GPU: force the SwiftShader WebGL path.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'pixel8a-landscape' }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/hockey-game/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
