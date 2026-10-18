import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Graph } from '../src/model/graph'
import { expect, familyMenu, isPhone, signIn, signInHere, test } from './fixtures'

/** A leaf with sub-leaves and threads both ways: it exercises every part of the Peek. */
function richLeaf(graph: Graph) {
  return [...graph.nodes.values()]
    .filter(
      (n) =>
        n.kind === 'leaf' &&
        n.parent !== '' &&
        n.children.length > 0 &&
        graph.out.has(n.id) &&
        graph.in.has(n.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0]!
}

async function openTree(page: Page) {
  await signIn(page)
  await page.goto('./#/tree/you/engineering')
  await expect(page.locator('[data-node]').first()).toBeAttached()
}

/** Leaves drawn as dots: a leaf at the top of the Family is a Tree's core instead. */
const dots = (graph: Graph) =>
  [...graph.nodes.values()].filter((n) => n.kind === 'leaf' && n.parent !== '').length

const peek = (page: Page) => page.getByRole('region', { name: /preview$/ })

/** The centre of an element on the map, in page pixels. */
async function centreOf(page: Page, selector: string) {
  const box = (await page.locator(`[data-map] > svg ${selector}`).first().boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const dot = (id: string) => `[data-node][data-id="${id}"] circle:last-of-type`

/** The map's camera transform, as written by the zoom behaviour. */
const camera = (page: Page) =>
  page
    .locator('[data-map] > svg > g')
    .first()
    .evaluate((g) => (g as SVGGElement).style.transform)

/** The map's zoom level, from the camera's transform. */
const scale = async (page: Page) => Number(/scale\(([-\d.e]+)\)/.exec(await camera(page))![1])

test('opens straight into the Family, with every Tree on one map', async ({ page, graph }) => {
  await signIn(page)
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
  await expect(page.getByRole('heading', { name: 'Engineering', level: 1 })).toBeVisible()
  const trees = graph.nodes.get('')!.children
  await expect(page.locator('[data-map] > svg [data-tree]')).toHaveCount(trees.length)
  // Each Tree is named under it, for when the whole Family is in view.
  const first = graph.nodes.get(trees[0]!)!
  await expect(page.locator(`[data-tree="${trees[0]}"] > text`)).toHaveText(first.title)
})

test('one click on a leaf of the Family opens it in the Peek, editable', async ({
  page,
  graph,
}) => {
  const leaf = richLeaf(graph)
  await signIn(page)
  const at = await centreOf(page, dot(leaf.id))
  await page.mouse.click(at.x, at.y)
  await expect(page).toHaveURL(
    new RegExp(`#/tree/you/engineering/${leaf.id.replace(/[.]/g, '\\.')}$`),
  )
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText(leaf.title)
  await expect(peek(page).locator('.cm-content')).toBeVisible()
})

test("a Tree's core shows that Tree as it is; Fit all trees shows the Family again", async ({
  page,
  graph,
}) => {
  await signIn(page)
  await expect(page.getByRole('status')).toHaveText('Synced to main')
  const tree = graph.nodes
    .get('')!
    .children.map((id) => graph.nodes.get(id)!)
    .find((n) => n.kind === 'branch')!
  const family = await scale(page)
  await page.locator(`[data-tree="${tree.id}"] [data-core] circle`).first().dispatchEvent('click')
  await expect(page).toHaveURL(new RegExp(`#/tree/you/engineering/${tree.id}$`))
  const panel = page.getByRole('region', { name: 'Tree preview' })
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText(tree.title)
  await expect(panel.getByRole('heading', { name: 'Inside this tree' })).toBeVisible()
  await expect.poll(() => scale(page)).toBeGreaterThan(family * 1.2)
  await panel.getByRole('button', { name: 'Dismiss' }).click()
  await page.getByRole('button', { name: 'Fit all trees' }).click()
  await expect.poll(() => scale(page)).toBeLessThan(family * 1.2)
})

test('a link to a leaf or a Tree opens on every Tree together', async ({ page, graph }) => {
  const leaf = richLeaf(graph)
  const tree = graph.nodes.get('')!.children.find((id) => graph.nodes.get(id)!.kind === 'branch')!
  for (const id of [leaf.id, tree]) {
    await page.goto(`./#/tree/you/engineering/${id}`)
    // Opened from its URL, not selected on a map already shown.
    if (id === leaf.id) await signInHere(page)
    else await page.reload()
    await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText(
      graph.nodes.get(id)!.title,
    )
    await expect(page.getByRole('status')).toHaveText('Synced to main')
    const opened = await scale(page)
    // On a phone the Peek's sheet covers the map's controls.
    await peek(page).getByRole('button', { name: 'Dismiss' }).click()
    await page.getByRole('button', { name: 'Fit all trees' }).click()
    // No closer than the whole Family (a Tree alone would be well over 1.2×).
    await expect.poll(() => scale(page)).toBeGreaterThan(opened / 1.2)
  }
})

test('hovering a dot names it', async ({ page, graph, isMobile }) => {
  test.skip(isMobile, 'Hover needs a mouse')
  const leaf = richLeaf(graph)
  await signIn(page)
  const at = await centreOf(page, dot(leaf.id))
  await page.mouse.move(at.x, at.y)
  const tip = page.getByText('Click to peek').locator('..')
  await expect(tip).toBeVisible()
  await expect(tip.locator('strong')).toHaveText(leaf.title)
  await page.mouse.move(5, 300)
  await expect(tip).toBeHidden()
})

test('draws one dot per leaf and branch, and one core per Tree', async ({ page, graph }) => {
  await openTree(page)
  const trees = graph.nodes.get('')!.children.map((id) => graph.nodes.get(id)!)
  const topLeaves = trees.filter((n) => n.kind === 'leaf').length
  await expect(page.locator('[data-map] > svg [data-core]')).toHaveCount(trees.length)
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(300 - topLeaves)
  await expect(page.locator('[data-node][data-kind="branch"]')).toHaveCount(
    graph.stats.branches - (trees.length - topLeaves),
  )
  // Threads inside each Tree and between Trees.
  await expect(page.locator('[data-thread]')).toHaveCount(graph.stats.threads)
  expect(await page.locator('[data-between]').count()).toBeGreaterThan(0)
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
  await expect(panel.locator('.cm-mention').first()).toBeVisible()

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

/** A touch swipe on the Peek's handle, `dy` pixels down (negative: up). */
async function swipe(page: Page, dy: number) {
  const handle = peek(page).locator('[class*="handle"]')
  const init = { pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 400 }
  await handle.dispatchEvent('pointerdown', init)
  await handle.dispatchEvent('pointerup', { ...init, clientY: 400 + dy })
}

test('on a phone, swiping the sheet up opens the full page; down goes back, then dismisses', async ({
  page,
  graph,
}) => {
  test.skip(!isPhone(page), 'The bottom sheet is on phones')
  const leaf = richLeaf(graph)
  await openTree(page)
  await page.goto(`./#/tree/you/engineering/${leaf.id}`)
  const panel = peek(page)
  await swipe(page, -10)
  await expect(panel).not.toHaveAttribute('data-expanded')
  await swipe(page, -120)
  await expect(panel).toHaveAttribute('data-expanded')
  await swipe(page, 120)
  await expect(panel).not.toHaveAttribute('data-expanded')
  await swipe(page, 120)
  await expect(panel).toHaveCount(0)
})

test("on a phone, a branch's More actions menu stays on screen", async ({ page, graph }) => {
  test.skip(!isPhone(page), 'Phone layout')
  const branch = [...graph.nodes.values()].find((n) => n.kind === 'branch' && n.parent !== '')!
  await openTree(page)
  await page.goto(`./#/tree/you/engineering/${branch.id}`)
  await peek(page).getByRole('button', { name: 'More actions' }).click()
  const box = (await peek(page).getByRole('menu').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('only the map zooms: the page itself never scales, nor zooms into a field', async ({
  page,
}) => {
  await openTree(page)
  const css = (selector: string, property: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property)
  expect(await css('html', 'touch-action')).toBe('pan-x pan-y')
  expect(await css('[data-map] > svg', 'touch-action')).toBe('none')
  if (isPhone(page)) {
    await page.getByRole('button', { name: /Search leaves/ }).click()
    expect(parseFloat(await css('input', 'font-size'))).toBeGreaterThanOrEqual(16)
  }
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

test('a Tree opened before its content arrives is fitted to its full shape when it does', async ({
  page,
  fake,
}) => {
  // Opened by its URL, so the map first shows the structure, with every dot at its smallest.
  fake.faults.latencyMs = 150
  await page.goto('./#/tree/you/engineering')
  await signInHere(page)
  await expect(page.getByRole('status')).toContainText('Loading')
  await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
  const opened = await camera(page)
  await page.getByRole('button', { name: 'Fit all trees' }).click()
  expect(await camera(page)).toBe(opened)
})

test("content arriving doesn't move a camera someone has moved", async ({ page, fake }) => {
  fake.faults.latencyMs = 300
  await page.goto('./#/tree/you/engineering')
  await signInHere(page)
  await expect(page.getByRole('status')).toContainText('Loading')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  const moved = await camera(page)
  await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
  expect(await camera(page)).toBe(moved)
})

test('the leaf panel, with nothing selected, shows the Family itself', async ({ page, graph }) => {
  await openTree(page)
  await page.getByRole('button', { name: 'Show leaf panel' }).click()
  const panel = page.getByRole('region', { name: 'Family preview' })
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Engineering')
  await expect(panel).toContainText(`${graph.stats.threads.toLocaleString('en-US')} threads`)
  await expect(panel.getByRole('heading', { name: 'Trees' })).toBeVisible()
})

test('renames the Family where its name is shown, and commits it to .yeraz.json', async ({
  page,
  fake,
}) => {
  await openTree(page)
  const title = page.getByRole('heading', { level: 1 })
  await title.getByRole('button', { name: 'Engineering' }).click()
  const field = page.getByRole('textbox', { name: 'Family name' })
  await expect(field).toBeFocused()
  await field.fill('Field notes')
  await field.press('Enter')
  await expect(title).toHaveText('Field notes')
  await expect(page.getByRole('status')).toContainText('Unsaved edits')

  // The Family's own Peek says the same, and Ctrl/Cmd+S commits it now.
  await page.goto('./#/tree/you/engineering/')
  await expect(peek(page).getByRole('heading', { level: 2 })).toHaveText('Field notes')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => JSON.parse(fake.repo('you/engineering').read('.yeraz.json')!) as unknown)
    .toEqual({ name: 'Field notes', color: 'green' })

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Field notes', level: 1 })).toBeVisible()
  const menu = await familyMenu(page)
  await expect(menu.getByRole('menuitem', { name: /^Field notes you\/engineering/ })).toBeVisible()
})

test('Escape keeps the old name, and an empty name is refused', async ({ page, fake }) => {
  await openTree(page)
  const title = page.getByRole('heading', { level: 1 })
  await title.getByRole('button', { name: 'Engineering' }).click()
  const field = page.getByRole('textbox', { name: 'Family name' })
  await field.fill('Something else')
  await field.press('Escape')
  await expect(title).toHaveText('Engineering')

  await title.getByRole('button', { name: 'Engineering' }).click()
  await field.fill('   ')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('A Family needs a name.')
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
  graph,
}) => {
  await openTree(page)
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(dots(graph))
  await expect(page.getByRole('status')).toHaveText('Synced to main')
  fake.resetLog()
  await page.reload()
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(dots(graph))
  await expect(page.getByRole('status')).toHaveText('Synced to main')
  expect(fake.log).toEqual([expect.objectContaining({ kind: 'head', status: 304, blobs: 0 })])
})

test('works offline from the saved copy', async ({ page, fake, graph }) => {
  await openTree(page)
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(dots(graph))
  fake.faults.offline = true
  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Offline · showing the saved copy')
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(dots(graph))
})

test('connects a repository by name', async ({ page, fake }) => {
  await fake.addRepo('friend/art', {
    '.yeraz.json': '{"name":"Art History","color":"amber"}',
    'baroque.md': '# Baroque\n',
  })
  await signIn(page)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Connect repository' }).click()
  await page.getByPlaceholder('owner/name').fill('friend/missing')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText("doesn't exist")
  await page.getByPlaceholder('owner/name').fill('friend/art')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  // It opens on the new Family; the menu switches back.
  await expect(page).toHaveURL(/#\/tree\/friend\/art$/)
  await expect(page.getByRole('heading', { name: 'Art History', level: 1 })).toBeVisible()
  await (await familyMenu(page)).getByRole('menuitem', { name: /^Engineering/ }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
  // And the app reopens on the Family last shown.
  await page.goto('./')
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
})

test('the Family view, its menu and the Peek have no accessibility violations', async ({
  page,
  graph,
}) => {
  // axe over the map and the leaf's editor takes 12–16 s alone; more beside other workers.
  test.slow()
  await signIn(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await familyMenu(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await page.goto(`./#/tree/you/engineering/${richLeaf(graph).id}`)
  await expect(peek(page)).toBeVisible()
  await expect(peek(page).locator('.cm-mention').first()).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('signs out from the Family menu', async ({ page }) => {
  await signIn(page)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Connect GitHub' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Connect GitHub' })).toBeVisible()
})
