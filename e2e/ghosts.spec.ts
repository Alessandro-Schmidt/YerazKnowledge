// Ghost leaves (issue #40): a link to a leaf not written yet is drawn on the map where its
// path says, hollow and dashed, with dashed threads from the leaves linking to it. Its Peek
// lists them and writes the leaf at that path, titled as the link reads.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, signInHere, test } from './fixtures'

const REPO = 'you/notes'
const FILES = {
  '.yeraz.json': '{"name":"Notes"}',
  'Identity/keycloak.md': '# Keycloak\n\nUses [OAuth 2.0 flows](/Identity/oauth.md).\n',
  'Identity/oidc.md': '# OIDC\n\nBuilt on [OAuth](/Identity/oauth.md).\n',
}
const GHOST = 'Identity/oauth.md'

/** The map itself, not the selection layer's copies above it. */
const map = (page: Page) => page.getByRole('img', { name: 'Knowledge map of Notes' })

test.beforeEach(async ({ fake }) => {
  await fake.addRepo(REPO, FILES)
})

test('a link to a leaf not written yet is a ghost on the map and in the Peek', async ({ page }) => {
  await page.goto(`./#/tree/${REPO}/Identity/keycloak.md`)
  await signInHere(page)
  await expect(map(page).locator(`[data-node][data-ghost][data-id="${GHOST}"]`)).toBeAttached()
  await expect(map(page).locator('[data-thread][data-ghost]')).toHaveCount(2)
  await expect(map(page).locator('[data-node][data-ghost]')).toHaveCount(1)

  // Threads out names it as not written yet; it opens its own Peek.
  const leaf = page.getByRole('region', { name: 'Leaf preview' })
  const out = leaf.getByRole('link', { name: /Oauth.*Not written yet/ })
  await expect(out).toBeVisible()
  await out.click()
  const ghost = page.getByRole('region', { name: 'Leaf not written yet' })
  await expect(ghost.getByRole('heading', { name: 'Oauth', level: 2 })).toBeVisible()
  await expect(ghost.getByRole('link', { name: /Keycloak/ })).toBeVisible()
  await expect(ghost.getByRole('link', { name: /OIDC/ })).toBeVisible()
  await expect(ghost.getByRole('button', { name: 'Write this leaf' })).toBeVisible()
  // Scanned once the sheet has come in: axe reads a fading sheet's colours as blended, and
  // fails the contrast of its button (CI run 40500151278).
  await ghost.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  // A linker opens from there; the ghost's dot on the map opens it again.
  await ghost.getByRole('link', { name: /OIDC/ }).click()
  await expect(page.getByRole('region', { name: 'Leaf preview' })).toBeVisible()
  await map(page).locator(`[data-node][data-id="${GHOST}"]`).dispatchEvent('click')
  await expect(ghost).toBeVisible()
})

test.describe('writing a ghost', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')

  test('Write this leaf creates it at the linked path, titled as the link reads', async ({
    page,
    fake,
  }) => {
    await page.goto(`./#/tree/${REPO}/${GHOST}`)
    await signInHere(page)
    await page
      .getByRole('region', { name: 'Leaf not written yet' })
      .getByRole('button', { name: 'Write this leaf' })
      .click()
    await expect(page.locator('.cm-title')).toContainText('OAuth 2.0 flows')
    // Written: a leaf on the map, and the threads to it are threads like any other.
    await expect(map(page).locator('[data-ghost]')).toHaveCount(0)
    await expect(map(page).locator(`[data-node][data-id="${GHOST}"]`)).toBeAttached()
    await page.keyboard.type('Authorization code, with PKCE.')
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect.poll(() => fake.repo(REPO).read(GHOST)).toContain('Authorization code')
    expect(fake.repo(REPO).read(GHOST)).toMatch(/^# OAuth 2\.0 flows\n/)
  })
})
