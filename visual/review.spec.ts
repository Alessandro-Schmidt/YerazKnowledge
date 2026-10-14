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
    await expect(page.locator('.mention').first()).toBeVisible()
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

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile)

  test('07 Phone', async ({ page }) => {
    await signIn(page)
    await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
    await expect(page.getByRole('region', { name: 'Leaf preview' })).toBeVisible()
    await shot(page, '07-phone')
  })
})
