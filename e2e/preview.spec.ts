// Issue #68: writing shows the result, not the Markdown, unless "Show Markdown" is on; a
// faint hint on each new line says how to open the options; the caret is the text's colour.

import type { Page } from '@playwright/test'
import { expect, isPhone, signInHere, test } from './fixtures'

const REPO = 'you/engineering'

async function newLeaf(page: Page) {
  await page.goto(`./#/tree/${REPO}`)
  await signInHere(page)
  await page.getByRole('button', { name: 'New leaf' }).first().click()
  await page.getByRole('dialog').getByLabel('Title').fill('Preview check')
  await page.getByRole('dialog').getByRole('button', { name: 'Create leaf' }).click()
  await expect(page.locator('.cm-title')).toBeVisible()
}

const line = (page: Page, n: number) => page.locator('.cm-content .cm-line').nth(n)

test.describe('writing', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')

  test('shows the result on the line being written, not its Markdown', async ({ page }) => {
    await newLeaf(page)
    await page.keyboard.type('## Section')
    // The cursor is still on this line: the heading shows, its "##" doesn't.
    await expect(page.locator('.cm-h2')).toHaveText('Section')

    await page.keyboard.type('\nSome **bold** and a [link](https://example.com) ')
    const text = page.locator('.cm-line', { hasText: 'Some' })
    await expect(text).toHaveText('Some bold and a link ')
    await expect(text.locator('.cm-strong')).toHaveText('bold')

    await page.keyboard.type('\n- [ ] A task')
    await expect(page.locator('input.cm-task')).toHaveCount(1)
    await expect(page.locator('.cm-line', { hasText: 'A task' })).toHaveText('A task')

    // Moving into a piece of syntax shows its marks, to edit it.
    await page.locator('.cm-strong').click()
    await expect(text).toContainText('**bold**')

    // "Show Markdown" shows all of it.
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Show Markdown' }).click()
    await expect(page.locator('.cm-content')).toContainText('## Section')
    await expect(page.locator('.cm-content')).toContainText('[link](https://example.com)')
  })

  test('a new line says how to open the options, and the caret is the text’s colour', async ({
    page,
  }) => {
    await newLeaf(page)
    await page.keyboard.type('First line\n')
    const hint = page.locator('.cm-line-hint')
    await expect(hint).toHaveCount(1)
    await expect(hint).toHaveText(/^Hold (⌘|Ctrl) to see options$/)
    // It sits on the empty line being written on, and goes once something is typed.
    await expect(line(page, 3).locator('.cm-line-hint')).toHaveCount(1)
    await page.keyboard.type('Second')
    await expect(hint).toHaveCount(0)

    const colours = await page.evaluate(() => {
      const content = document.querySelector('.cm-content')!
      const cursor = document.querySelector('.cm-cursor')
      return {
        text: getComputedStyle(content).color,
        caret: getComputedStyle(content).caretColor,
        cursor: cursor && getComputedStyle(cursor).borderLeftColor,
      }
    })
    expect(colours.caret).toBe(colours.text)
    if (colours.cursor) expect(colours.cursor).toBe(colours.text)
  })
})

test('on touch, the hint says tap and hold or type /', async ({ page }) => {
  test.skip(!isPhone(page), 'Touch devices only')
  await newLeaf(page)
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  // An empty leaf has its own hint (emptyText.ts); a new line after some text has this one.
  await page.keyboard.type('First line')
  await page.keyboard.press('Enter')
  await expect(page.locator('.cm-line-hint')).toHaveText('Tap and hold, or type /, to see options')
})
