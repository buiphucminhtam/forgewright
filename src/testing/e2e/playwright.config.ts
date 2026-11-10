import { defineConfig } from '@playwright/test';
import rootConfig from '../../../playwright.config.js';

export default defineConfig({
  ...rootConfig,
  testDir: './tests',
  reporter: [['html', { outputFolder: '../../../.playwright/reports', open: 'never' }]],
});
