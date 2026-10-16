import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Graph } from '../src/model/graph'
import { expect, isPhone, signIn, test } from './fixtures'

/** A leaf with sub-leaves and threads both ways: it exercises every part of the Peek. */
function richLeaf(graph: Graph) {
  return [...graph.nodes.values()]
    .filter(
      (n) =>
        n.kind === 'leaf' && n.children.length > 0 && graph.out.has(n.id) && graph.in.has(n.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0]!
}

async function openTree(page: Page) {
  await signIn(page)
  await page.goto('./#/tree/you/engineering')
  await expect(page.locator('[data-node]').first()).toBeAttached()
}

const peek = (page: Page) => page.getByRole('region', { name: /preview$/ })

test('Home lists the Tree, shows its numbers, and opens it', async ({ page, graph }) => {
  await signIn(page)
  const row = page.getByRole('button', { name: /Engineering/ })
  await expect(row).toContainText('you/engineering')
  await expect(row).toContainText('300')
  await row.click()
  await expect(page.getByRole('heading', { name: 'Engineering', level: 2 })).toBeVisible()
  await expect(page.getByText(String(graph.stats.branches), { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Open tree' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
  await expect(page.getByRole('heading', { name: 'Engineering', level: 1 })).toBeVisible()
})

/** The centre of a dot or of the core on the Home map, in page pixels. */
async function centreOf(page: Page, selector: string) {
  const box = (await page.locator(`[data-tree="you/engineering"] ${selector}`).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const homeDot = (id: string) => `[data-id="${id}"] circle:last-child`

test('a dot on Home opens its leaf straight away, without opening the Tree first', async ({
  page,
  graph,
}) => {
  const leaf = richLeaf(graph)
  await signIn(page)
  const at = await centreOf(page, homeDot(leaf.id))
  await page.mouse.click(at.x, at.y)
  await expect(page).toHaveURL(
    new RegExp(`#/tree/you/engineering/${leaf.id.replace(/[.]/g, '\\.')}$`),
  )
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText(leaf.title)
})

test('the core on Home opens the Tree itself, and the space around it selects the Tree', async ({
  page,
}) => {
  await signIn(page)
  const core = await centreOf(page, '[data-core]')
  await page.mouse.click(core.x, core.y)
  await expect(page).toHaveURL(/#\/tree\/you\/engineering\/$/)
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText('Engineering')

  // Back on Home, with no card over the map yet (on a short phone it covers the core).
  await page.goto('./')
  // By position: WebKit hit-tests SVG text by its glyphs, so a locator click can miss it.
  const name = (await page
    .locator('[data-tree="you/engineering"] text')
    .filter({ hasText: /^Engineering$/ })
    .boundingBox())!
  await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2)
  await expect(page.getByRole('link', { name: 'Open tree' })).toBeVisible()
  await expect(page).not.toHaveURL(/tree/)
})

test('hovering a dot on Home names it', async ({ page, graph, isMobile }) => {
  test.skip(isMobile, 'Hover needs a mouse')
  const leaf = richLeaf(graph)
  await signIn(page)
  const at = await centreOf(page, homeDot(leaf.id))
  await page.mouse.move(at.x, at.y)
  const tip = page.getByText('Click to open').locator('..')
  await expect(tip).toBeVisible()
  await expect(tip.locator('strong')).toHaveText(`${leaf.icon ? `${leaf.icon} ` : ''}${leaf.title}`)
  await expect(
    page.locator(`[data-tree="you/engineering"] [data-id="${leaf.id}"]`),
  ).toHaveAttribute('data-hot', '')
  await page.mouse.move(5, 300)
  await expect(tip).toBeHidden()
})

test('draws one node per leaf and branch', async ({ page, graph }) => {
  await openTree(page)
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(300)
  await expect(page.locator('[data-node][data-kind="branch"]')).toHaveCount(graph.stats.branches)
  await expect(page.locator('[data-thread]')).toHaveCount(graph.stats.threads)
})

test('clicking a node opens the Peek with its title, sub-leaves and threads', async ({
  page,
  graph,
}) => {
  const leaf = richLeaf(graph)
  await openTree(page)
  await page.locator(`[data-node][data-id="${leaf.id}"] circle`).first().dispatchEvent('click')
  const panel = peek(page)
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText(leaf.title)
  await expect(page).toHaveURL(new RegExp(`${leaf.id.replace(/[.]/g, '\\.')}$`))

  const subLeaves = panel
    .getByRole('heading', { name: 'Sub-leaves' })
    .locator('..')
    .getByRole('button')
  await expect(subLeaves).toHaveCount(leaf.children.length)
  const out = panel
    .getByRole('heading', { name: /Threads out/ })
    .locator('..')
    .getByRole('button')
  await expect(out).toHaveCount(graph.out.get(leaf.id)!.length)
  const into = panel
    .getByRole('heading', { name: /Threads in/ })
    .locator('..')
    .getByRole('button')
  await expect(into).toHaveCount(graph.in.get(leaf.id)!.length)
  await expect(panel.locator('.mention').first()).toBeVisible()

  // The map dims everything but the selection's neighbours.
  await expect(page.locator('[data-map]')).toHaveAttribute('data-focus')
  await expect(page.locator(`[data-overlay] [data-node][data-id="${leaf.id}"]`)).toHaveAttribute(
    'data-sel',
  )

  // Following a thread selects the other leaf.
  const target = graph.nodes.get(graph.out.get(leaf.id)![0]!)!
  await out.first().click()
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText(target.title)
})

test('expands the Peek to a full page, comes back, and dismisses it', async ({ page, graph }) => {
  const leaf = richLeaf(graph)
  await openTree(page)
  await page.goto(`./#/tree/you/engineering/${leaf.id}`)
  const panel = peek(page)
  await panel.getByRole('button', { name: 'Open full page' }).click()
  await expect(panel).toHaveAttribute('data-expanded')
  await panel.getByRole('button', { name: 'Back to the map' }).click()
  await expect(panel).not.toHaveAttribute('data-expanded')
  await panel.getByRole('button', { name: 'Dismiss' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-map]')).toHaveAttribute('data-focus')
})

test('opening a leaf URL shows its Peek, even after the Peek was dismissed', async ({
  page,
  graph,
}) => {
  const leaf = richLeaf(graph)
  await openTree(page)
  await page.goto(`./#/tree/you/engineering/${leaf.id}`)
  await peek(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(peek(page)).toHaveCount(0)
  const other = graph.out.get(leaf.id)![0]!
  await page.goto(`./#/tree/you/engineering/${other}`)
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText(
    graph.nodes.get(other)!.title,
  )
})

test('clicking the empty map clears the selection', async ({ page, graph }) => {
  await openTree(page)
  await page.goto(`./#/tree/you/engineering/${richLeaf(graph).id}`)
  await expect(peek(page)).toBeVisible()
  await page.locator('[data-map] svg > rect').dispatchEvent('click')
  await expect(peek(page)).toHaveCount(0)
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-focus')
})

test('the core opens the Tree itself', async ({ page, graph }) => {
  await openTree(page)
  await page.locator('[data-core] circle').dispatchEvent('click')
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText('Engineering')
  await expect(peek(page)).toContainText(`${graph.stats.threads.toLocaleString('en-US')} threads`)
})

test('renames the Tree where its name is shown, and commits it to .yeraz.json', async ({
  page,
  fake,
}) => {
  await openTree(page)
  const title = page.getByRole('heading', { level: 1 })
  await title.getByRole('button', { name: 'Engineering' }).click()
  const field = page.getByRole('textbox', { name: 'Tree name' })
  await expect(field).toBeFocused()
  await field.fill('Field notes')
  await field.press('Enter')
  await expect(title).toHaveText('Field notes')
  await expect(page.getByRole('status')).toContainText('Unsaved edits')

  // The Tree's own Peek says the same, and Ctrl/Cmd+S commits it now.
  await page.goto('./#/tree/you/engineering/')
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText('Field notes')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => JSON.parse(fake.repo('you/engineering').read('.yeraz.json')!) as unknown)
    .toEqual({ name: 'Field notes', color: 'green' })

  await page.goto('./')
  await expect(page.getByRole('button', { name: /^Field notes you\/engineering/ })).toBeVisible()
})

test('Escape keeps the old name, and an empty name is refused', async ({ page, fake }) => {
  await openTree(page)
  const title = page.getByRole('heading', { level: 1 })
  await title.getByRole('button', { name: 'Engineering' }).click()
  const field = page.getByRole('textbox', { name: 'Tree name' })
  await field.fill('Something else')
  await field.press('Escape')
  await expect(title).toHaveText('Engineering')

  await title.getByRole('button', { name: 'Engineering' }).click()
  await field.fill('   ')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('A Tree needs a name.')
  await expect(field).toBeVisible()
  await field.press('Escape')
  await expect(title).toHaveText('Engineering')
  expect(JSON.parse(fake.repo('you/engineering').read('.yeraz.json')!)).toMatchObject({
    name: 'Engineering',
  })
})

test('the Explorer collapses and comes back', async ({ page }) => {
  await openTree(page)
  const explorer = page.getByRole('complementary', { name: 'Explorer' })
  if (isPhone(page)) {
    await expect(explorer).toHaveCount(0)
    await page.getByRole('button', { name: 'Show explorer' }).click()
  }
  await expect(explorer).toBeVisible()
  await explorer.getByRole('button', { name: 'Hide explorer' }).click()
  await expect(explorer).toHaveCount(0)
  await page.getByRole('button', { name: 'Show explorer' }).click()
  await expect(explorer).toBeVisible()
})

test('the Explorer reaches every leaf from the keyboard', async ({ page, graph }) => {
  test.skip(isPhone(page), 'Phones have no keyboard')
  await openTree(page)
  const tree = page.getByRole('tree', { name: 'Branches and leaves' })
  const first = tree.getByRole('treeitem').first()
  await first.focus()
  const firstId = await first.getAttribute('data-row')
  const firstNode = graph.nodes.get(firstId!)!
  // Top-level branches start open: Right moves into the first child.
  await page.keyboard.press('ArrowRight')
  await expect(tree.locator(`[data-row="${firstNode.children[0]}"]`)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(first).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(first).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const second = graph.nodes.get(graph.nodes.get('')!.children[1]!)!
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText(second.title)
})

test('second open: exactly one request (a 304) and no content downloads', async ({
  page,
  fake,
}) => {
  await openTree(page)
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(300)
  await expect(page.getByRole('status')).toHaveText('Synced to main')
  fake.resetLog()
  await page.reload()
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(300)
  await expect(page.getByRole('status')).toHaveText('Synced to main')
  expect(fake.log).toEqual([expect.objectContaining({ kind: 'head', status: 304, blobs: 0 })])
})

test('works offline from the saved copy', async ({ page, fake }) => {
  await openTree(page)
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(300)
  fake.faults.offline = true
  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Offline · showing the saved copy')
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(300)
})

test('connects a repository by name', async ({ page, fake }) => {
  await fake.addRepo('friend/art', {
    '.yeraz.json': '{"name":"Art History","color":"amber"}',
    'baroque.md': '# Baroque\n',
  })
  await signIn(page)
  await page.getByRole('button', { name: 'Connect repository' }).click()
  await page.getByPlaceholder('owner/name').fill('friend/missing')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText("doesn't exist")
  await page.getByPlaceholder('owner/name').fill('friend/art')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  // The rail's row; the Tree's card shows the name too, as a rename button.
  await expect(page.getByRole('button', { name: /^Art History friend\/art/ })).toBeVisible()
})

test('Home, the Tree view and the Peek have no accessibility violations', async ({
  page,
  graph,
}) => {
  await signIn(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.goto(`./#/tree/you/engineering/${richLeaf(graph).id}`)
  await expect(peek(page)).toBeVisible()
  await expect(peek(page).locator('.mention').first()).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('signs out from Home', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Connect GitHub' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Connect GitHub' })).toBeVisible()
})
