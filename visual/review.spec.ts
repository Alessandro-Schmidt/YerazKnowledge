import type { Page } from '@playwright/test'
import { expect, signIn, test as base } from '../e2e/fixtures'
import { createFakeGitHub } from '../test/fake-github/fakeGitHub'
import { designTrees } from '../test/fake-github/designFixture'

const test = base.extend({
  // The design's four Trees instead of a generated one.
  // eslint-disable-next-line no-empty-pattern
  fake: async ({}, use) => {
    const fake = createFakeGitHub({ login: 'you', tokens: ['fake-token'] })
    for (const tree of designTrees().reverse()) await fake.addRepo(tree.repo, tree.files)
    await use(fake)
  },
})

const OUT = 'visual-review'
const KEYCLOAK = 'Identity/keycloak.md'
const OAUTH = 'Identity/oauth-2-0.md'

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700) // camera and fade transitions
}

async function shot(page: Page, name: string) {
  await settle(page)
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile)

  test('01–02 Home', async ({ page }) => {
    await signIn(page)
    await expect(page.locator('[data-tree]')).toHaveCount(4)
    await shot(page, '01-home')
    await page.getByRole('button', { name: /Music Theory/ }).click()
    await shot(page, '02-home-tree-selected')
  })

  test('03–06 Tree view', async ({ page }) => {
    await signIn(page)
    await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
    await expect(page.getByRole('region', { name: 'Leaf preview' })).toBeVisible()
    await expect(page.locator('.cm-mention').first()).toBeVisible()
    await shot(page, '03-tree-view')

    await page.getByRole('button', { name: 'Open full page' }).click()
    await shot(page, '04-leaf-full-page')

    await page.getByRole('button', { name: 'Back to the map' }).click()
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await page.getByRole('button', { name: 'Hide explorer' }).click()
    await page.goto('./#/tree/you/engineering')
    await page.getByRole('button', { name: 'Fit the tree' }).click()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await shot(page, '05-tree-zoomed-out')

    await page.getByRole('button', { name: 'Fit the tree' }).click()
    await page.goto(`./#/tree/you/engineering/${OAUTH}`)
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await settle(page)
    await page
      .locator(`[data-overlay] [data-node][data-id="${OAUTH}"] circle`)
      .last()
      .hover({ force: true })
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/06-map-only.png` })
  })
})

test.describe('themes', () => {
  test.skip(({ isMobile }) => isMobile)

  const withTheme = (page: Page, theme: object) =>
    page.addInitScript((t) => localStorage.setItem('yeraz-theme', t), JSON.stringify(theme))

  test('09–10 Appearance', async ({ page }) => {
    await signIn(page)
    await page.goto('./#/settings/appearance')
    await shot(page, '09-appearance')
    await page.getByRole('radio', { name: /Paper/ }).check()
    await page.getByRole('radio', { name: 'Violet' }).check()
    await page.getByRole('radio', { name: /Newsreader/ }).check()
    await shot(page, '10-appearance-paper-violet')
  })

  for (const [name, theme] of [
    ['11-tree-graphite-blue', { base: 'graphite', mode: 'dark', accent: 'blue', font: 'geist' }],
    ['12-tree-paper-green-serif', { base: 'paper', mode: 'light', accent: 'green', font: 'serif' }],
  ] as const) {
    test(name, async ({ page }) => {
      await withTheme(page, theme)
      await signIn(page)
      await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
      await expect(page.locator('.cm-mention').first()).toBeVisible()
      await shot(page, name)
    })
  }
})

test.describe('editor', () => {
  test.skip(({ isMobile }) => isMobile)

  test('08 Editor: a leaf on its full page', async ({ page }) => {
    await signIn(page)
    await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
    await page.getByRole('button', { name: 'Open full page' }).click()
    await expect(page.locator('.cm-title')).toBeVisible()
    await shot(page, '08-editor')
  })
})

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile)

  test('07 Phone', async ({ page }) => {
    await signIn(page)
    await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
    await expect(page.getByRole('region', { name: 'Leaf preview' })).toBeVisible()
    await shot(page, '07-phone')
  })
})
