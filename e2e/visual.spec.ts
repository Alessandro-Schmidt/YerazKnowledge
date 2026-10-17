// Visual snapshots (development-plan.md §7.3): the Family, the leaf view in each base, Map only,
// Phone and Appearance, with the design's own Trees, at pixel density 2. They are rendered
// and compared in Playwright's Linux image only (snapshots.yml, on demand), so fonts and anti-aliasing
// match pixel for pixel. To re-render them after a visual change, run the Snapshots workflow
// (`gh workflow run snapshots.yml -f update=true`) and commit its artifact into e2e/visual.spec.ts-snapshots/.
// A changed baseline is a design change: compare it with design/screens/ before committing.

import type { Page } from '@playwright/test'
import { designTrees } from '../test/fake-github/designFixture'
import { createFakeGitHub } from '../test/fake-github/fakeGitHub'
import { expect, signIn, test as base } from './fixtures'

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  fake: async ({}, use) => {
    const fake = createFakeGitHub({ login: 'you', tokens: ['fake-token'] })
    for (const tree of designTrees().reverse()) await fake.addRepo(tree.repo, tree.files)
    await use(fake)
  },
})

test.skip(
  process.env.YERAZ_SNAPSHOTS !== '1',
  'Rendered in the Playwright Linux image, by snapshots.yml',
)
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'One engine is enough to catch a layout change',
)

const KEYCLOAK = 'Identity/keycloak.md'

async function matches(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByText(/Loading|Saving/)).toHaveCount(0)
  await page.mouse.move(0, 0)
  await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.002 })
}

const withTheme = (page: Page, theme: object) =>
  page.addInitScript((t) => localStorage.setItem('yeraz-theme', t), JSON.stringify(theme))

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile)

  test('the Family', async ({ page }) => {
    await signIn(page)
    await page.goto('./#/tree/you/engineering')
    await expect(page.getByRole('status')).toHaveText('Synced to main')
    await matches(page, 'family')
  })

  for (const [name, theme] of [
    ['tree-vanta', null],
    ['tree-graphite', { base: 'graphite', mode: 'dark', accent: 'blue', font: 'geist' }],
    ['tree-paper', { base: 'paper', mode: 'light', accent: 'green', font: 'serif' }],
  ] as const) {
    test(`the Tree view, ${name.slice(5)}`, async ({ page }) => {
      if (theme) await withTheme(page, theme)
      await signIn(page)
      await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
      await expect(page.getByRole('region', { name: 'Leaf preview' })).toBeVisible()
      await expect(page.locator('.cm-mention').first()).toBeVisible()
      await expect(page.getByRole('status')).toHaveText('Synced to main')
      await matches(page, name)
    })
  }

  test('Map only', async ({ page }) => {
    await signIn(page)
    await page.goto('./#/tree/you/engineering')
    await expect(page.getByRole('status')).toHaveText('Synced to main')
    await page.getByRole('button', { name: 'Hide explorer' }).click()
    await matches(page, 'map-only')
  })

  test('Appearance', async ({ page }) => {
    await signIn(page)
    await page.goto('./#/settings/appearance')
    await expect(page.getByRole('radio', { name: /Vanta/ })).toBeChecked()
    await matches(page, 'appearance')
  })
})

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile)

  test('a leaf on the phone', async ({ page }) => {
    await signIn(page)
    await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
    await expect(page.getByRole('region', { name: 'Leaf preview' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Synced to main')
    await matches(page, 'phone')
  })
})
