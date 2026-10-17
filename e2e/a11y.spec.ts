// An axe scan on every screen (development-plan.md §7.3), on desktop and phone engines.
// The token screen, Home, the Tree view with the Peek, the editor, the Move dialog and
// Appearance are scanned next to their own tests; these are the rest.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Graph } from '../src/model/graph'
import { expect, familyMenu, signIn, signInHere, test } from './fixtures'

const REPO = 'you/engineering'

const violations = async (page: Page, only?: string) =>
  (
    await (only ? new AxeBuilder({ page }).include(only) : new AxeBuilder({ page })).analyze()
  ).violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }))

const firstLeaf = (graph: Graph) =>
  [...graph.nodes.values()]
    .filter((n) => n.kind === 'leaf')
    .sort((a, b) => a.id.localeCompare(b.id))[0]!

test('search', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: /Search leaves, branches, trees/ }).click()
  const search = page.getByRole('dialog', { name: 'Search' })
  await search.getByRole('combobox').fill('a')
  await expect(search.getByRole('option').first()).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('a leaf on its full page', async ({ page, graph }) => {
  await page.goto(`./#/tree/${REPO}/${firstLeaf(graph).id}`)
  await signInHere(page)
  await page.getByRole('button', { name: 'Open full page' }).click()
  await expect(page.getByRole('button', { name: 'Back to the map' })).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('the icon picker', async ({ page, graph }) => {
  // axe over the map, the editor and every emoji takes 12–27 s alone; more beside other workers.
  test.slow()
  await page.goto(`./#/tree/${REPO}/${firstLeaf(graph).id}`)
  await signInHere(page)
  await page.getByRole('button', { name: /^(Add icon|Change icon)/ }).click()
  const icons = page.getByRole('group', { name: 'Icons' })
  await expect(icons.getByRole('region', { name: 'Flags' })).toBeAttached()
  // The picker alone: the Tree view around it is scanned in tree.spec.ts.
  expect(await violations(page, '[role="group"][aria-label="Icons"]')).toEqual([])
})

test('the new leaf dialog', async ({ page }) => {
  await page.goto(`./#/tree/${REPO}`)
  await signInHere(page)
  await page.getByRole('banner').getByRole('button', { name: 'New leaf' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('connecting and creating a repository', async ({ page }) => {
  await signIn(page)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Connect repository' }).click()
  await expect(page.getByPlaceholder('owner/name')).toBeVisible()
  expect(await violations(page)).toEqual([])
  await page.keyboard.press('Escape')
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Create a new repository' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await violations(page)).toEqual([])
})
