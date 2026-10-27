import { defineConfig, devices } from '@playwright/test'

// The contract test (development-plan.md §7.5): the production build against real GitHub,
// in a real browser, so CORS changes are caught too. Needs YERAZ_CONTRACT_TOKEN (a
// fine-grained token with Contents: read and write on YERAZ_CONTRACT_REPO only).
const PORT = Number(process.env.E2E_PORT) || 4175

export default defineConfig({
  testDir: 'contract',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    // A trace records the token (typed, and in every request's headers): kept on your machine
    // only, never in CI, where test results could end up somewhere others can read them.
    trace: process.env.CI ? 'off' : 'retain-on-failure',
  },
  webServer: {
    command: `npx vite build --outDir dist-contract && npx vite preview --outDir dist-contract --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
