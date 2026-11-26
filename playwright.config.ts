import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';

const pathToExtension = path.resolve(process.cwd(), 'extension/.output/chrome-mv3');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    headless: false,
    ...devices['Desktop Chrome'],
    launchOptions: {
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
      ],
    },
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: {
          args: [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--no-sandbox',
          ],
        },
      },
    },
  ],
});
