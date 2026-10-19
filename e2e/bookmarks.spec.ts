// Bookmarks for pasted links (issue #12): pasting a URL offers to keep it as a link or make
// it a bookmark, a paragraph of one titled link shown as a card wherever the leaf is shown.

import type { Page } from '@playwright/test'
import { expect, signInHere, test } from './fixtures'

const REPO = 'you/engineering'
const PAGE = 'https://en.wikipedia.org/wiki/Baroque'

/** Pastes text into the editor, as the clipboard would. */
const paste = (page: Page, text: string) =>
  page.locator('.cm-content').evaluate((el, text) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', text)
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    )
  }, text)

test.describe('bookmarks', () => {
  test.skip(({ isMobile }) => isMobile, 'Pasting runs on desktop engines')

  test.beforeEach(async ({ page, fake }) => {
    await fake.repo(REPO).commit({
      message: 'links',
      additions: [{ path: 'links.md', contents: '# Links\n\nReading list:\n' }],
    })
    await page.goto(`./#/tree/${REPO}/links.md`)
    await signInHere(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
  })

  test('a pasted URL becomes a bookmark: a card whose address opens it and ⋯ edits it', async ({
    page,
    fake,
  }) => {
    const editor = page.locator('.cm-content')
    const menu = page.getByRole('menu', { name: 'Paste link' })
    await paste(page, PAGE)
    await menu.getByRole('menuitem', { name: 'Bookmark' }).click()
    await expect(menu).toHaveCount(0)
    const card = editor.locator('.cm-embed-bookmark')
    await expect(card).toContainText('Baroque')
    await expect(card).toContainText('en.wikipedia.org/wiki/Baroque')

    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read('links.md'))
      .toBe(`# Links\n\nReading list:\n\n[Baroque](${PAGE})\n`)

    // Its address opens the page in a new tab, as in the read view.
    await page.evaluate(() => {
      const w = window as unknown as { opened: unknown[] }
      w.opened = []
      window.open = (...args) => (w.opened.push(args), null)
    })
    await card.getByText('en.wikipedia.org/wiki/Baroque').click()
    expect(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened)).toEqual([
      [PAGE, '_blank', 'noopener,noreferrer'],
    ])
    await expect(card).toBeVisible()

    // Its ⋯ shows its Markdown, to edit.
    await card.hover()
    await card.getByRole('button', { name: 'Embed actions' }).click()
    await page.getByRole('menuitem', { name: 'Show Markdown' }).click()
    await expect(editor).toContainText(`[Baroque](${PAGE})`)
  })

  test('Keep as link, Escape or typing leave the URL as pasted; videos get no menu', async ({
    page,
    fake,
  }) => {
    const menu = page.getByRole('menu', { name: 'Paste link' })
    await paste(page, PAGE)
    await menu.getByRole('menuitem', { name: 'Keep as link' }).click()
    await expect(menu).toHaveCount(0)
    await page.keyboard.type(' and ')
    await paste(page, 'https://example.com/b')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await page.keyboard.type(' or ')
    await paste(page, 'https://example.com/c')
    await expect(menu).toBeVisible()
    await page.keyboard.type('.')
    await expect(menu).toHaveCount(0)
    await page.keyboard.press('Enter')
    await paste(page, 'https://youtu.be/dQw4w9WgXcQ')
    await expect(page.locator('.cm-content')).toContainText('youtu.be/dQw4w9WgXcQ')
    await expect(menu).toHaveCount(0)

    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read('links.md'))
      .toBe(
        `# Links\n\nReading list:\n${PAGE} and https://example.com/b or https://example.com/c.\nhttps://youtu.be/dQw4w9WgXcQ`,
      )
  })
})
