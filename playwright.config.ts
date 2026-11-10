import { defineConfig, devices } from '@playwright/test';
import { resolveChromiumFunctionalProfile } from './scripts/runtime/playwright_chromium.mjs';

const chromiumProfile = resolveChromiumFunctionalProfile();

export default defineConfig({
  testDir: './src/testing/e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: '.playwright/reports', open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02, // Allow up to 2% pixel differences
      threshold: 0.2,          // Visual color difference sensitivity
      animations: 'disabled',  // Automatically disable animations
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...chromiumProfile.playwrightProjectUse },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], ...chromiumProfile.playwrightProjectUse },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  outputDir: '.playwright/results/',
});
