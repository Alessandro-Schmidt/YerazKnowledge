// M4's checks (development-plan.md §6): title search, PDF export (print), the installable app.

import themes from '../design/themes/themes.json' with { type: 'json' }
import { expect, signIn, signInHere, test } from './fixtures'

const paperBg = themes.bases.paper.tokens.bg

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

test.describe('PDF export', () => {
  test('prints only the leaf, on Paper, with videos as links', async ({ page, fake }) => {
    await fake.repo('you/engineering').commit({
      message: 'printable',
      additions: [
        {
          path: 'printable.md',
          contents:
            '# Printable\n\nA paragraph to print.\n\n[The talk](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n',
        },
      ],
    })
    await page.goto('./#/tree/you/engineering/printable.md')
    await signInHere(page)
    // Vanta on screen; the print dialog is replaced by a flag.
    await page.evaluate(() => {
      ;(window as unknown as { printed: boolean }).printed = false
      window.print = () => void ((window as unknown as { printed: boolean }).printed = true)
    })
    await expect(page.getByText('A paragraph to print.')).toBeVisible()
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Export PDF' }).click()
    expect(await page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(
      true,
    )

    await page.emulateMedia({ media: 'print' })
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    )
    expect(bg).toBe(paperBg)
    const root = page.locator('#print-root')
    await expect(root).toBeVisible()
    await expect(root.getByText('A paragraph to print.')).toBeVisible()
    await expect(page.getByRole('banner')).toBeHidden()
    await expect(root.locator('iframe')).toBeHidden()
    await expect(root.getByRole('link', { name: /The talk · youtube\.com/ })).toBeVisible()

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await expect(root).toHaveCount(0)
  })
})
