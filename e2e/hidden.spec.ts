// Hiding a leaf, a branch or a Tree (owner's request): the Peek's ⋯ menu takes it off the
// map with everything under it, written to the note's line 2 (a branch's README.md), and
// Settings › Hidden shows it again.

import { expect, signInHere, test } from './fixtures'

const REPO = 'you/notes'
const FILES = {
  '.yeraz.json': '{"name":"Notes"}',
  'Identity/keycloak.md': '# 🔐 Keycloak\n\nSee [OAuth](/Identity/oauth.md).\n',
  'Identity/oauth.md': '# OAuth\n\nSee [Keycloak](/Identity/keycloak.md).\n',
  'Old/2019.md': '# 2019\n\nPast.\n',
}

test.beforeEach(async ({ fake }) => {
  await fake.addRepo(REPO, FILES)
})

test('Hide takes a leaf off the map and out of the Explorer; Settings › Hidden shows it again', async ({
  page,
  fake,
}) => {
  await page.goto(`./#/tree/${REPO}/Identity%2Fkeycloak.md`)
  await signInHere(page)
  const peek = page.getByRole('region', { name: 'Leaf preview' })
  await expect(page.locator('[data-map] [data-thread]')).toHaveCount(2)
  await peek.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'Hide' }).click()
  await expect(peek).toHaveCount(0)
  // Still listed in the Explorer, marked hidden: it has no place on the map.
  await expect(page.getByRole('treeitem', { name: /Keycloak/ })).toHaveAttribute('data-hidden', '')
  await expect(page.getByRole('treeitem', { name: /Keycloak/ })).toHaveAccessibleName(
    /hidden from the map/,
  )
  await expect(page.locator('[data-map] [data-id="Identity/keycloak.md"]')).toHaveCount(0)
  await expect(page.locator('[data-map] [data-thread]')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('Identity/keycloak.md'))
    .toBe('# 🔐 Keycloak\n<!-- yeraz {"hidden":true} -->\n\nSee [OAuth](/Identity/oauth.md).\n')

  await page.goto('./#/settings/hidden')
  const row = page.getByText('🔐 Keycloak', { exact: false }).locator('..')
  await expect(row).toContainText('Identity/keycloak.md')
  await row.getByRole('button', { name: 'Show' }).click()
  await expect(page.getByText('Nothing is hidden.')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('Identity/keycloak.md'))
    .toBe(FILES['Identity/keycloak.md'])
  await page.goto(`./#/tree/${REPO}`)
  await expect(
    page.locator('[data-map] [data-node][data-id="Identity/keycloak.md"]'),
  ).toBeAttached()
})

test('a Tree hides with everything under it, through its README.md', async ({ page, fake }) => {
  await page.goto(`./#/tree/${REPO}/Old`)
  await signInHere(page)
  const peek = page.getByRole('region', { name: 'Tree preview' })
  await peek.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'Hide' }).click()
  await expect(page.getByRole('treeitem', { name: /2019/ })).toHaveCount(0)
  await expect(page.getByRole('treeitem', { name: /^Old, hidden/ })).toBeVisible()
  await expect(page.locator('[data-map] [data-tree="Old"]')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('Old/README.md'))
    .toBe('# Old\n<!-- yeraz {"hidden":true} -->\n\n')
  await page.goto('./#/settings/hidden')
  await expect(page.getByText('Old/', { exact: true })).toBeVisible()
})

test('a hidden leaf stays listed in what holds it; its eye shows it on the map again', async ({
  page,
  fake,
}) => {
  const HIDDEN = 'you/hidden'
  await fake.addRepo(HIDDEN, {
    ...FILES,
    'Identity/keycloak.md':
      '# 🔐 Keycloak\n<!-- yeraz {"hidden":true} -->\n\nSee [OAuth](/Identity/oauth.md).\n',
  })
  await page.goto(`./#/tree/${HIDDEN}/Identity`)
  await signInHere(page)
  await expect(page.locator('[data-map] [data-id="Identity/keycloak.md"]')).toHaveCount(0)

  // The branch's Peek lists it, marked hidden, beside what is on the map.
  const peek = page.getByRole('region', { name: /preview/ })
  const listed = peek.getByRole('button', { name: 'Show Keycloak on the map again (hidden)' })
  await expect(listed).toBeVisible()
  await expect(peek.getByRole('link', { name: /OAuth/ }).first()).toBeVisible()

  // The Explorer's eye shows it again.
  const row = page.getByRole('treeitem', { name: /^Keycloak, hidden/ })
  await row.locator('[title^="Hidden from the map"]').click()
  await expect(
    page.locator('[data-map] [data-node][data-id="Identity/keycloak.md"]'),
  ).toBeAttached()
  await expect(page.getByRole('treeitem', { name: /Keycloak/ })).not.toHaveAttribute(
    'data-hidden',
    '',
  )
  await expect(listed).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(HIDDEN).read('Identity/keycloak.md'))
    .toBe(FILES['Identity/keycloak.md'])
})
