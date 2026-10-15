// M3's exit tests (development-plan.md §6): mentions, the insert menu, images and embeds.

import type { Graph } from '../src/model/graph'
import { expect, signInHere, test } from './fixtures'

const REPO = 'you/engineering'

const mutations = (fake: { log: { operation?: string }[] }) =>
  fake.log.filter((e) => e.operation === 'mutation')

/** Two leaves without sub-leaves, the first not yet linking to the second (a unique title). */
function pair(graph: Graph) {
  const all = [...graph.nodes.values()].filter((n) => n.kind === 'leaf')
  const leaves = all.filter((n) => n.children.length === 0).sort((a, b) => a.id.localeCompare(b.id))
  const from = leaves[0]!
  const to = leaves.find(
    (n) =>
      n.id !== from.id &&
      !(graph.out.get(from.id) ?? []).includes(n.id) &&
      all.filter((m) => m.title.startsWith(n.title.split(' ')[0]!)).length === 1,
  )!
  return { from, to }
}

test.describe('mentions', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')
  // Opens the map twice and the editor once.
  test.setTimeout(60_000)

  test('picking a mention inserts a thread; after the save the map shows it', async ({
    page,
    fake,
    graph,
  }) => {
    const { from, to } = pair(graph)
    await page.goto(`./#/tree/${REPO}`)
    await signInHere(page)
    await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
    const threads = await page.locator('[data-map] [data-thread]').count()

    await page.goto(`./#/edit/${REPO}/${from.id}`)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(`\nSee @${to.title.split(' ')[0]}`)
    await page.getByRole('option', { name: new RegExp(`^${to.title}`) }).click()
    await expect(page.locator('.cm-content')).toContainText(to.title)
    await expect(page.getByRole('status')).toContainText('Unsaved edits')

    fake.resetLog()
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => mutations(fake).length).toBe(1)
    expect(fake.repo(REPO).read(from.id)).toContain(`[${to.title}](/${to.id})`)

    // Outside the edited line the link is a chip; clicking it opens the leaf.
    await page.keyboard.press('ControlOrMeta+Home')
    const chip = page.locator(`.cm-mention[data-path="${to.id}"]`)
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page).toHaveURL(new RegExp(`#/tree/${REPO}/${to.id}$`))
    await expect(page.locator('[data-map] [data-thread]')).toHaveCount(threads + 1)
  })
})
