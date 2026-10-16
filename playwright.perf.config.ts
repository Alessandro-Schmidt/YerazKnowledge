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
  // No tracing: it snapshots the whole DOM around every action, on the main thread, and
  // was most of what these tests measured (thousands of map elements per snapshot).
  use: { ...base.use, trace: 'off' },
  reporter: [
    ['list'],
    ['json', { outputFile: 'perf-results/results.json' }],
    // In CI: failures and every measured number as annotations on the job.
    ...(process.env.CI ? ([['github'], ['./perf/notices.ts']] as const) : []),
  ],
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'], cpuThrottling: 4 } as never },
  ],
})
