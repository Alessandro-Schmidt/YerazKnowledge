// The top bar in a narrow window (issue #76): its controls never overlap or run off it.
// The status and New leaf give up their words, the search box becomes its icon, and the
// views scroll sideways.

import { expect, signInHere, test } from './fixtures'

test.skip(({ isMobile }) => isMobile, 'Phones have their own bar (the views in a row below it)')

for (const width of [660, 760, 900, 1000, 1100, 1180, 1440]) {
  test(`at ${width} px nothing in the bar overlaps or leaves the window`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('./#/tree/you/engineering')
    await signInHere(page)
    await expect(page.locator('[data-map]')).toBeVisible()
    const boxes = await page
      .locator('header')
      .first()
      .evaluate((bar) =>
        [...bar.children]
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => {
            const r = el.getBoundingClientRect()
            return { left: r.left, right: r.right, name: el.className }
          }),
      )
    for (const [i, box] of boxes.entries()) {
      expect(box.right, `${box.name} stays in the window`).toBeLessThanOrEqual(width)
      const next = boxes[i + 1]
      if (next) expect(box.right, `${box.name} ends before the next`).toBeLessThanOrEqual(next.left)
    }
    // The Family's name keeps a few letters.
    expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.width).toBeGreaterThan(40)
  })
}
