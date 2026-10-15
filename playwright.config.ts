import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], deviceScaleFactor: 2 } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  // End-to-end tests run against a production build that differs in one switch: VITE_E2E=1
  // lets tests point it at the local fake GitHub (src/github/endpoint.ts).
  webServer: {
    command: `npx cross-env VITE_E2E=1 vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
