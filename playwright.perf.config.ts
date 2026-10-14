import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Performance budgets (ARCHITECTURE.md §11), measured on the production build with test
// marks. Laptop runs unthrottled; phone runs with 4× CPU throttling (development-plan.md §7.4).
export default defineConfig({
  ...base,
  testDir: 'perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'perf-results/results.json' }]],
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'], cpuThrottling: 4 } as never },
  ],
})
