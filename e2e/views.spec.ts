// The ways to see a Family (design/views/README.md): the switcher, each view showing the
// same graph and the same selection, Settings › Views, and Tree colours in .yeraz.json.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { treesOf } from '../src/map/family'
import type { Graph } from '../src/model/graph'
import { VIEW_IDS, VIEWS, type ViewId } from '../src/views/views'
import { expect, isPhone, signInHere, test } from './fixtures'

const REPO = 'you/engineering'

/** A leaf with threads, under a Tree: something every view draws. */
const leafOf = (graph: Graph) =>
  [...graph.nodes.values()]
    .filter((n) => n.kind === 'leaf' && n.parent !== '' && graph.out.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id))[0]!

async function openOn(page: Page, view: ViewId, path = '') {
  // Once per test: a reload keeps whatever the test switched to.
  await page.addInitScript((v) => {
    if (sessionStorage.getItem('view-set')) return
    sessionStorage.setItem('view-set', '1')
    localStorage.setItem('yeraz-view', v)
  }, view)
  await page.goto(`./#/tree/${REPO}/${path}`)
  await signInHere(page)
}

const switcher = (page: Page) => page.getByRole('radiogroup', { name: 'View' })

/** What each view draws, enough to know it is there. */
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

test('switches views from the switcher and remembers the choice on this device', async ({
  page,
}) => {
  await openOn(page, 'map')
  await expect(shown.map(page)).toBeVisible()
  await switcher(page).getByRole('radio', { name: 'Outline' }).click()
  await expect(shown.outline(page)).toBeVisible()
  await expect(switcher(page).getByRole('radio', { name: 'Outline' })).toBeChecked()
  await page.reload()
  await expect(shown.outline(page)).toBeVisible()
  await switcher(page).getByRole('radio', { name: 'Map', exact: true }).click()
  await expect(shown.map(page)).toBeVisible()
})

for (const view of VIEW_IDS.filter((v) => v !== 'map')) {
  test(`${VIEWS[view].label}: shows the Family and keeps the selection`, async ({
    page,
    graph,
  }) => {
    const leaf = leafOf(graph)
    await openOn(page, view, leaf.id)
    await expect(shown[view](page)).toBeVisible()
    // The selection is the URL's, whatever the view; it is marked where the view draws it.
    await expect(page).toHaveURL(new RegExp(`${leaf.id.replace(/[.]/g, '\\.')}$`))
    const marked = page.locator(`[data-id="${leaf.id}"][data-on], [data-sel][data-id="${leaf.id}"]`)
    if (['outline', 'treemap', 'graph', 'rings'].includes(view))
      await expect(marked.first()).toBeAttached()
    // Choosing another node selects it: a Tree in the lists, a thread's other end on a canvas.
    const tree = treesOf(graph).find((t) => !leaf.id.startsWith(`${t}/`))!
    const other = ['outline', 'columns'].includes(view) ? tree : graph.out.get(leaf.id)![0]!
    if (view === 'columns') {
      // A Tree in the first column; on a phone, a neighbour in the one column shown.
      const items = isPhone(page)
        ? page
            .getByRole('list', { name: /^Inside / })
            .last()
            .getByRole('button')
        : page.getByRole('list', { name: 'Inside Engineering' }).getByRole('button', {
            name: graph.nodes.get(tree)!.title,
          })
      await items.filter({ hasNotText: leaf.title }).first().click()
      await expect(page).not.toHaveURL(new RegExp(`${leaf.id.replace(/[.]/g, '\\.')}$`))
      return
    } else if (view === 'outline') {
      await page
        .getByRole('button', { name: graph.nodes.get(tree)!.title, exact: true })
        .first()
        .click()
    } else {
      // A tile, or a node on a canvas (a click on its drawing, wherever the camera is).
      await page
        .locator(`button[data-tile][data-id="${other}"], [data-canvas] svg [data-id="${other}"]`)
        .first()
        .dispatchEvent('click')
    }
    await expect(page).toHaveURL(new RegExp(`${other.replace(/[.]/g, '\\.')}$`))
  })
}

test('choosing a view from a leaf’s page shows the view, keeping the leaf selected', async ({
  page,
  graph,
}) => {
  const leaf = leafOf(graph)
  await openOn(page, 'map', leaf.id)
  const peek = page.getByRole('region', { name: /preview$/ })
  if (!isPhone(page)) {
    await peek.getByRole('button', { name: 'Open full page' }).click()
    await expect(peek).toHaveAttribute('data-expanded')
  }
  await switcher(page).getByRole('radio', { name: 'Outline' }).click()
  await expect(shown.outline(page)).toBeInViewport()
  if (isPhone(page)) await expect(peek).toHaveCount(0)
  else await expect(peek).not.toHaveAttribute('data-expanded')
  expect(decodeURIComponent(page.url()).endsWith(`/${leaf.id}`)).toBe(true)
})

test('Columns opens a column per level down to the selection', async ({ page, graph }) => {
  test.skip(isPhone(page), 'Phones fold the parent columns into spines')
  const leaf = leafOf(graph)
  await openOn(page, 'columns', leaf.id)
  const tree = treesOf(graph).find((t) => leaf.id.startsWith(`${t}/`) || leaf.id.startsWith(t))!
  await expect(page.getByRole('region', { name: graph.nodes.get(tree)!.title })).toBeVisible()
  await expect(page.getByRole('region', { name: /preview$/ })).toHaveAttribute('data-docked')
})

test('Growth rings dates leaves from git and shows the core sample', async ({ page, graph }) => {
  const leaf = leafOf(graph)
  await openOn(page, 'rings', leaf.id)
  await expect(page.getByRole('img', { name: 'Core sample, one band per month' })).toBeVisible()
  if (!isPhone(page)) {
    const card = page.getByRole('region', { name: 'Selected leaf' })
    await expect(card).toContainText(/Planted \w+ \d{4}/)
    await card.getByRole('button', { name: 'Open leaf' }).click()
    await expect(page.getByRole('region', { name: /preview$/ })).toHaveAttribute('data-expanded')
  }
})

test('Settings › Views chooses how a Family is shown', async ({ page }) => {
  await page.goto('./#/settings/views')
  await signInHere(page)
  await page.getByRole('radio', { name: /^Treemap/ }).check()
  await page.getByRole('link', { name: 'Done' }).click()
  await expect(shown.treemap(page)).toBeVisible()
  await expect(switcher(page).getByRole('radio', { name: 'Treemap' })).toBeChecked()
})

test('Tree colours are saved in .yeraz.json and colour that Tree on the map', async ({
  page,
  fake,
  graph,
}) => {
  const tree = treesOf(graph)[0]!
  const title = graph.nodes.get(tree)!.title
  const pick = async (row: string, colour: string) => {
    const radio = page
      .getByRole('radiogroup', { name: `${row} colour` })
      .getByRole('radio', { name: colour })
    await radio.click()
    await expect(radio).toBeChecked()
  }
  await page.goto('./#/settings/colours')
  await signInHere(page)
  await pick(title, 'Amber')
  await pick('Engineering', 'Blue')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => JSON.parse(fake.repo(REPO).read('.yeraz.json') ?? '{}'))
    .toMatchObject({ color: 'blue', trees: { [tree]: 'amber' } })
  await page.goto(`./#/tree/${REPO}`)
  await expect(page.locator(`[data-map] [data-tree="${tree}"]`).first()).toHaveAttribute(
    'style',
    /--tree: var\(--c-amber\)/,
  )
  // Back to the Family's colour: the Tree's entry goes.
  await page.goto('./#/settings/colours')
  await pick(title, 'Family')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => JSON.parse(fake.repo(REPO).read('.yeraz.json') ?? '{}').trees)
    .toBeUndefined()
})

for (const view of VIEW_IDS.filter((v) => v !== 'map')) {
  test(`${VIEWS[view].label} has no accessibility violations`, async ({ page, graph }) => {
    test.slow()
    await openOn(page, view, leafOf(graph).id)
    await expect(shown[view](page)).toBeVisible()
    // The leaf's editor loads on its own; its title is the Peek's heading.
    const ownPanel = view === 'rings' || (!isPhone(page) && (view === 'graph' || view === 'atlas'))
    if (!ownPanel) await expect(page.locator('.cm-editor').first()).toBeVisible()
    const found = (await new AxeBuilder({ page }).exclude('.cm-editor').analyze()).violations
    expect(found.map((v) => `${v.id} ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
  })
}

test('the Views and Tree colours settings have no accessibility violations', async ({ page }) => {
  await page.goto('./#/settings/views')
  await signInHere(page)
  for (const settings of ['views', 'colours', 'hidden']) {
    await page.goto(`./#/settings/${settings}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const found = (await new AxeBuilder({ page }).analyze()).violations
    expect(found.map((v) => `${settings}: ${v.id}`)).toEqual([])
  }
})
