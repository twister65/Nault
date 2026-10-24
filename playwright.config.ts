import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:4200',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.CHROME_BIN || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    }
  },
  webServer: {
    command: 'npm run wallet:dev -- --host 127.0.0.1 --port 4200',
    url: 'http://127.0.0.1:4200/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
