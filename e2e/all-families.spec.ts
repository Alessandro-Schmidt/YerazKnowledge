// Issue #69: with more than one Family, the app opens on all of them together, each in its
// own ring; a node opens in its Family's Peek, and its edits save to its own repository.
// Settings › Views can make this device open on the last Family instead.

import type { Page } from '@playwright/test'
import { treesOf } from '../src/map/family'
import { VIEW_IDS, VIEWS, type ViewId } from '../src/views/views'
import { expect, familyMenu, isPhone, signIn, signInHere, test } from './fixtures'

test.beforeEach(async ({ fake, page }) => {
  // A phone opens on the last Family unless this device chose every Family (tested below).
  if (isPhone(page) && !test.info().title.startsWith('a phone opens'))
    await page.addInitScript(() => localStorage.setItem('yeraz-open', 'all'))
  await fake.addRepo('you/art', {
    '.yeraz.json': '{"name":"Art"}\n',
    'Baroque/caravaggio.md': '# Caravaggio\n\nLight and dark.\n',
    'Baroque/bernini.md': '# Bernini\n',
  })
})

test('opens on every Family together, each in its own ring', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/#\/all$/)
  await expect(page.locator('[data-group]')).toHaveCount(2)
  await expect(page.locator('[data-group="you/art"] text')).toHaveText('Art')
  await expect(page.locator('[data-group="you/engineering"] text')).toHaveText('Engineering')
  await expect(page.locator('[data-node][data-id="you/art::Baroque/caravaggio.md"]')).toHaveCount(1)
  await expect(page.locator('[data-node][data-id^="you/engineering::"]').first()).toBeAttached()
  await expect(await familyMenu(page)).toContainText('All Families')
})

test('the logo in the top bar leads to the introduction, and from there to every Family', async ({
  page,
}) => {
  await signIn(page)
  await page.goto('./#/tree/you/art/Baroque/caravaggio.md')
  await expect(page.getByRole('heading', { name: 'Caravaggio' })).toBeVisible()
  await page.getByRole('link', { name: 'Yeraz', exact: true }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
  await page.getByRole('link', { name: 'Back to your notes' }).click()
  await expect(page).toHaveURL(/#\/all$/)
  await expect(page.locator('[data-group]')).toHaveCount(2)
})

test('a node opens in its own Family, and its edits save there', async ({ page, fake }) => {
  test.skip(isPhone(page), 'Typing tests run on desktop engines')
  await signIn(page)
  await page.goto('./#/all/you/art/Baroque/caravaggio.md')
  await expect(page.getByRole('heading', { name: 'Caravaggio' })).toBeVisible()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\nChiaroscuro.')
  await page.getByRole('button', { name: 'Save now' }).click()
  await expect
    .poll(() => fake.repo('you/art').read('Baroque/caravaggio.md'))
    .toContain('Chiaroscuro.')
})

test('Keep open holds a leaf of one Family beside a leaf of another', async ({ page, graph }) => {
  test.skip(isPhone(page), 'Phones show one Peek, as a sheet')
  await page.setViewportSize({ width: 1600, height: 900 })
  const other = [...graph.nodes.values()].find((n) => n.kind === 'leaf' && n.parent !== '')!
  await signIn(page)
  await page.goto('./#/all/you/art/Baroque/caravaggio.md')
  const peeks = page.getByRole('region', { name: 'Leaf preview' })
  await expect(peeks).toHaveCount(1)
  await peeks.getByRole('button', { name: 'Keep open' }).click()
  await page.goto(`./#/all/you/engineering/${other.id}`)
  await expect(peeks).toHaveCount(2)
  await expect(peeks.nth(0).getByRole('heading', { level: 2 })).toHaveText('Caravaggio')
  await expect(peeks.nth(1).getByRole('heading', { level: 2 })).toHaveText(other.title)
  await peeks.nth(0).getByRole('button', { name: 'Dismiss' }).click()
  await expect(peeks).toHaveCount(1)
})

test('@ links to another Family’s Tree; the map of every Family draws the thread', async ({
  page,
  fake,
  graph,
}) => {
  test.skip(isPhone(page), 'Typing tests run on desktop engines')
  const tree = graph.nodes.get('')!.children.find((id) => graph.nodes.get(id)!.kind === 'branch')!
  const title = graph.nodes.get(tree)!.title
  await signIn(page)
  await page.goto('./#/all')
  await expect(page.locator('[data-group]')).toHaveCount(2)
  // Counted once every Family's content is in (Refresh is busy while one loads): threads
  // come with the content, so an early count misses them (CI run 40773196482).
  await expect(page.locator('[data-map] [data-between]').first()).toBeAttached()
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  const between = await page.locator('[data-map] [data-between]').count()

  await page.goto('./#/tree/you/art/Baroque/caravaggio.md')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(`\nSee @${title}`)
  await page.getByRole('option', { name: new RegExp(`^${title}.*Engineering · Tree`) }).click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo('you/art').read('Baroque/caravaggio.md'))
    .toContain(
      `[${title}](https://github.com/you/engineering/blob/main/${encodeURI(tree)}/README.md)`,
    )

  await page.goto('./#/all')
  await expect(page.locator('[data-map] [data-between]')).toHaveCount(between + 1)
})

test('a leaf moves to another Family, found by typing where', async ({ page, fake }) => {
  test.skip(isPhone(page), 'The move dialog is the same on phones; one run is enough')
  await signIn(page)
  await page.goto('./#/tree/you/art/Baroque/caravaggio.md')
  const panel = page.getByRole('region', { name: 'Leaf preview' })
  await panel.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'Move…' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('searchbox', { name: 'Where to' }).fill('top of engin')
  await expect(dialog.getByRole('radio')).toHaveCount(1)
  await dialog
    .getByRole('radio', { name: 'At the top of Engineering, as a Tree of its own' })
    .check()
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering\/caravaggio\.md$/)
  // Committed in both, without a Save: the other Family's first.
  await expect.poll(() => fake.repo('you/art').read('Baroque/caravaggio.md')).toBeUndefined()
  expect(fake.repo('you/engineering').read('caravaggio.md')).toContain('Light and dark.')
})

test('Settings › Views can open the app on the last Family instead', async ({ page }) => {
  await signIn(page)
  await page.goto('./#/tree/you/art')
  await expect(page.locator('[data-map]')).toBeVisible()
  await page.goto('./#/settings/views')
  await page.getByRole('radio', { name: /The last Family/ }).check()
  await page.goto('./#/')
  await expect(page).toHaveURL(/#\/tree\/you\/art$/)

  await page.goto('./#/settings/views')
  await page.getByRole('radio', { name: /All Families/ }).check()
  await page.goto('./#/')
  await expect(page).toHaveURL(/#\/all$/)
})

test('opening the app on one Family’s address still shows every Family; a leaf’s stays', async ({
  page,
}) => {
  await signIn(page)
  // A tab the browser restored, or a bookmark: a fresh load of a Family's own address.
  await page.goto('./#/tree/you/art')
  await page.reload()
  await expect(page).toHaveURL(/#\/all$/)
  await page.goto('./#/tree/you/art/Baroque/caravaggio.md')
  await page.reload()
  await expect(page).toHaveURL(/#\/tree\/you\/art\/Baroque\/caravaggio\.md$/)
})

/** What each view draws, enough to know it is there (as views.spec.ts). */
const shown: Record<ViewId, (page: Page) => ReturnType<Page['locator']>> = {
  map: (p) => p.locator('[data-map]'),
  mind: (p) => p.getByRole('img', { name: /^Mind map of/ }),
  outline: (p) => p.getByRole('list', { name: /outline$/ }),
  columns: (p) => p.getByRole('list', { name: /^Inside / }).first(),
  treemap: (p) => p.locator('[data-tile]').first(),
  graph: (p) => p.getByRole('img', { name: 'Graph of leaves and threads' }),
  rings: (p) => p.getByRole('img', { name: /^Growth rings of/ }),
  atlas: (p) => p.getByRole('img', { name: /^Atlas of/ }),
}

for (const view of VIEW_IDS.filter((v) => v !== 'map')) {
  test(`${VIEWS[view].label} shows every Family together`, async ({ page, graph }) => {
    await page.addInitScript((v) => localStorage.setItem('yeraz-view', v), view)
    await page.goto('./')
    await signInHere(page)
    await expect(page).toHaveURL(/#\/all$/)
    await expect(shown[view](page)).toBeVisible()
    // A leaf of one Family selected in it (`#/all/…`), beside the other Family's largest Tree.
    await page.goto('./#/all/you/art/Baroque/caravaggio.md')
    const main = page.locator('main')
    const largest = treesOf(graph)
      .map((id) => graph.nodes.get(id)!)
      .sort((a, b) => b.total - a.total)[0]!
    await expect(main).toContainText(/caravaggio/i)
    // A phone's Columns show only the selection's path.
    if (!(view === 'columns' && isPhone(page)))
      await expect(main).toContainText(new RegExp(largest.title, 'i'))
  })
}

test('a phone opens on the last Family, every Family being a tap away', async ({ page }) => {
  test.skip(!isPhone(page), 'The phone default')
  await signIn(page)
  await expect(page).toHaveURL(/#\/tree\/you\//)
  await page.getByRole('link', { name: 'Yeraz', exact: true }).click()
  await page.getByRole('link', { name: 'Back to your notes' }).click()
  await expect(page).toHaveURL(/#\/all$/)
})
