import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Screenshots of the app in the same states as design/screens/01–07, with the design's
// own Trees, for the owner's visual review (development-plan.md §7.3, "Before merging M1").
// They are written to visual-review/, not compared: approving them is a human decision.
export default defineConfig({
  ...base,
  testDir: 'visual',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      },
    },
    { name: 'phone', use: { ...devices['iPhone 14'] } },
  ],
})
