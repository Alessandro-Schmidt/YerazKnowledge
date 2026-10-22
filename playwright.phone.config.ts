import { devices } from '@playwright/test'
import base from './playwright.config'
const exe = { launchOptions: { executablePath: '/opt/pw-browsers/chromium' } }
export default {
  ...base,
  projects: [
    { name: 'pixel', use: { ...devices['Pixel 7'], ...exe } },
    { name: 'small', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 667 }, ...exe } },
  ],
}
