// The Explorer and the Peek are dragged wider or narrower by their inner edge (issue #80);
// the widths are kept on this device.

import type { Locator, Page } from '@playwright/test'
import { expect, signInHere, test } from './fixtures'

test.skip(({ isMobile }) => isMobile, 'Phones show the panels as sheets')

/** Whole pixels: panels come in with a transform, which leaves fractions while it plays. */
const width = async (el: Locator) => Math.round((await el.boundingBox())!.width)

/** Drags a panel edge sideways by `dx` pixels. */
async function drag(page: Page, handle: Locator, dx: number) {
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y)
  await page.mouse.move(x + dx, y)
  await page.mouse.up()
}

test('the Explorer and the Peek resize by their edges, and keep their widths', async ({
  page,
  graph,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const leaf = [...graph.nodes.values()].find((n) => n.kind === 'leaf' && n.parent !== '')!
  await page.goto(`./#/tree/you/engineering/${leaf.id}`)
  await signInHere(page)
  const explorer = page.getByRole('complementary', { name: 'Explorer' })
  const peek = page.getByRole('region', { name: /preview$/ })
  await expect(peek).toBeVisible()
  await expect.poll(() => width(explorer)).toBe(272)
  await expect.poll(() => width(peek)).toBe(420)

  await drag(page, page.getByRole('separator', { name: 'Explorer width' }), 100)
  await expect.poll(() => width(explorer)).toBe(372)
  await drag(page, page.getByRole('separator', { name: 'Leaf panel width' }), -150)
  await expect.poll(() => width(peek)).toBe(570)

  // From the keyboard: arrows by 16 px, Home to the least.
  const edge = page.getByRole('separator', { name: 'Explorer width' })
  await edge.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => width(explorer)).toBe(356)
  await expect(edge).toHaveAttribute('aria-valuenow', '356')

  await page.reload()
  await expect(peek).toBeVisible()
  await expect.poll(() => width(explorer)).toBe(356)
  await expect.poll(() => width(peek)).toBe(570)

  // A double click puts a panel back as it was.
  await page.getByRole('separator', { name: 'Leaf panel width' }).dblclick()
  await expect.poll(() => width(peek)).toBe(420)
})
