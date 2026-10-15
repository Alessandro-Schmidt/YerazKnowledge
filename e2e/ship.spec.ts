// M4's checks (development-plan.md §6): title search, PDF export (print), the installable app.

import { expect, signIn, test } from './fixtures'

test.describe('title search', () => {
  test('Ctrl/Cmd+K finds a leaf by title in any Tree and opens it', async ({
    page,
    graph,
    isMobile,
  }) => {
    const leaf = [...graph.nodes.values()]
      .filter((n) => n.kind === 'leaf')
      .sort((a, b) => b.title.length - a.title.length)[0]!
    await signIn(page)
    if (isMobile) await page.getByRole('button', { name: /Search leaves/ }).click()
    else await page.keyboard.press('ControlOrMeta+k')
    const box = page.getByRole('combobox', { name: 'Search titles' })
    await expect(box).toBeFocused()
    await box.fill(leaf.title.toUpperCase())
    await expect(page.getByRole('option').first()).toContainText(leaf.title)
    await box.press('Enter')
    await expect(page).toHaveURL(new RegExp(`#/tree/you/engineering/${leaf.id}$`))
    await expect(page.getByRole('heading', { name: leaf.title, level: 2 })).toBeVisible()
  })

  test('shows when nothing matches, and Escape closes it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard')
    await signIn(page)
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox', { name: 'Search titles' }).fill('zzzz qqqq')
    await expect(page.getByText('No titles match.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
  })
})
