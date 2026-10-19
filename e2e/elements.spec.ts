// Tables (issue #82), and what the live preview draws in place of Markdown: images, links,
// tables and embeds never show their Markdown unless the person asks, from their ⋯ menu,
// which also changes or deletes them. Toggles (<details>) show as on github.com (#38).

import type { Page } from '@playwright/test'
import type { FakeGitHub } from '../test/fake-github/fakeGitHub'
import { expect, signInHere, test } from './fixtures'

const REPO = 'you/engineering'
const LEAF = 'elements.md'

async function open(page: Page, fake: FakeGitHub, text: string) {
  await fake.repo(REPO).commit({ message: 'a', additions: [{ path: LEAF, contents: text }] })
  await page.goto(`./#/tree/${REPO}/${LEAF}`)
  await signInHere(page)
  await expect(page.locator('.cm-title')).toBeVisible()
}

/** Commits the leaf (Ctrl/Cmd+S); the polled text is what GitHub holds. */
async function save(page: Page, fake: FakeGitHub) {
  await page.keyboard.press('ControlOrMeta+s')
  return expect.poll(() => fake.repo(REPO).read(LEAF), { timeout: 10_000 })
}

test.describe('tables', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')

  const TABLE =
    '# Ports\n\nThe services:\n\n| Name | Port |\n| :-- | --: |\n| Realm | 8080 |\n\nEnd.\n'

  test('a table is a grid: cells are written in place, Tab past the last adds a row', async ({
    page,
    fake,
  }) => {
    await open(page, fake, TABLE)
    const editor = page.locator('.cm-content')
    const grid = editor.locator('.cm-table table')
    await expect(grid.locator('th')).toHaveText(['Name', 'Port'])
    await expect(grid.locator('td')).toHaveText(['Realm', '8080'])
    await expect(editor).not.toContainText('| Name')

    await grid.locator('td').nth(1).click()
    // To the cell's end: End doesn't move the caret in WebKit on macOS.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')
    await page.keyboard.type('0')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Admin')
    await page.keyboard.press('Tab')
    await page.keyboard.type('9000')
    await expect(grid.locator('td')).toHaveText(['Realm', '80800', 'Admin', '9000'])
    await (
      await save(page, fake)
    ).toBe(
      '# Ports\n\nThe services:\n\n| Name | Port |\n| :-- | --: |\n| Realm | 80800 |\n| Admin | 9000 |\n\nEnd.\n',
    )
  })

  test('the ⋯ menu adds and deletes columns and rows, shows the Markdown, deletes the table', async ({
    page,
    fake,
  }) => {
    await open(page, fake, TABLE)
    const editor = page.locator('.cm-content')
    const grid = editor.locator('.cm-table')
    await grid.locator('td').first().click()
    await grid.getByRole('button', { name: 'Table actions' }).click()
    await page.getByRole('menuitem', { name: 'Add column right' }).click()
    await expect(grid.locator('th')).toHaveText(['Name', 'Column 3', 'Port'])
    await page.keyboard.type('Up')
    await grid.locator('td').first().click()
    await grid.getByRole('button', { name: 'Table actions' }).click()
    await page.getByRole('menuitem', { name: 'Add row below' }).click()
    await expect(grid.locator('tbody tr')).toHaveCount(2)
    await grid.getByRole('button', { name: 'Table actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete row' }).click()
    await expect(grid.locator('tbody tr')).toHaveCount(1)
    await (
      await save(page, fake)
    ).toContain('| Name | Column 3 | Port |\n| :-- | --- | --: |\n| Realm | Up | 8080 |\n')

    await grid.getByRole('button', { name: 'Table actions' }).click()
    await page.getByRole('menuitem', { name: 'Show Markdown' }).click()
    await expect(editor.locator('.cm-table')).toHaveCount(0)
    await expect(editor).toContainText('| Name | Column 3 | Port |')
    // Leaving it draws it again.
    await editor.getByText('End.').click()
    await expect(editor.locator('.cm-table')).toHaveCount(1)

    await editor.locator('.cm-table').getByRole('button', { name: 'Table actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete table' }).click()
    await expect(editor.locator('.cm-table')).toHaveCount(0)
    await expect(editor).not.toContainText('Name')
    await (await save(page, fake)).toBe('# Ports\n\nThe services:\n\nEnd.\n')
  })

  test('the insert menu adds a table, its first heading ready to write', async ({ page, fake }) => {
    await open(page, fake, '# Ports\n\nThe services:\n')
    await page.locator('.cm-content').getByText('The services:').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.down('Control')
    await page.waitForTimeout(2100)
    await page.keyboard.up('Control')
    await page.getByRole('menuitem', { name: 'Table' }).click()
    await expect(page.locator('.cm-table th').first()).toBeFocused()
    await page.keyboard.type('Name')
    await (
      await save(page, fake)
    ).toBe('# Ports\n\nThe services:\n\n| Name | Column 2 |\n| --- | --- |\n|  |  |\n\n')
  })
})

test.describe('links and images', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')

  test('a link never shows its Markdown, even while written in; its ⋯ edits or removes it', async ({
    page,
    fake,
  }) => {
    await open(page, fake, '# Links\n\nRead [the docs](https://example.org/docs) first.\n')
    const editor = page.locator('.cm-content')
    await expect(editor).toContainText('Read the docs first.')
    // The cursor in the link (by keyboard) shows no Markdown either.
    await editor.getByText('first.').click()
    await page.keyboard.press('Home')
    // Its start is two places, outside and inside: one step more to cross.
    for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.type('X')
    await expect(editor).toContainText('Read the dXocs first.')
    await expect(editor).not.toContainText('](')
    await page.keyboard.press('Backspace')
    // Backspace at its end takes a letter of its text, never a mark; typing there adds to it.
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Backspace')
    await expect(editor).toContainText('Read the doc first.')
    await expect(editor).not.toContainText('](')
    await page.keyboard.type('s')
    await expect(editor).toContainText('Read the docs first.')

    await editor.locator('.cm-link').hover()
    await page.getByRole('button', { name: 'Link actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit link' }).click()
    const form = page.getByRole('form', { name: 'Edit link' })
    await form.getByLabel('Text').fill('our docs')
    await form.getByLabel('Address').fill('https://example.org/guide')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(editor).toContainText('Read our docs first.')
    await (
      await save(page, fake)
    ).toBe('# Links\n\nRead [our docs](https://example.org/guide) first.\n')

    await editor.locator('.cm-link').hover()
    await page.getByRole('button', { name: 'Link actions' }).click()
    await page.getByRole('menuitem', { name: 'Remove link' }).click()
    await (await save(page, fake)).toBe('# Links\n\nRead our docs first.\n')
  })

  test('an image stays drawn on the cursor’s line; its ⋯ shows the Markdown or deletes it', async ({
    page,
    fake,
  }) => {
    await open(
      page,
      fake,
      '# Images\n\nAbove.\n\n![Realm](https://example.org/realm.png)\n\nBelow.\n',
    )
    const editor = page.locator('.cm-content')
    const image = editor.locator('.cm-image')
    await expect(image).toHaveCount(1)
    await editor.getByText('Below.').click()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(image).toHaveCount(1)
    await expect(editor).not.toContainText('![Realm]')

    await image.hover()
    await image.getByRole('button', { name: 'Image actions' }).click()
    await page.getByRole('menuitem', { name: 'Show Markdown' }).click()
    await expect(editor).toContainText('![Realm](https://example.org/realm.png)')
    await editor.getByText('Above.').click()
    await expect(editor.locator('.cm-image')).toHaveCount(1)

    await editor.locator('.cm-image').hover()
    await editor.locator('.cm-image').getByRole('button', { name: 'Image actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete image' }).click()
    await expect(editor.locator('.cm-image')).toHaveCount(0)
    await (await save(page, fake)).toBe('# Images\n\nAbove.\n\nBelow.\n')
  })
})

test.describe('toggles', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines; the leaf is the same on phones')

  test('a <details> toggle shows its summary, folded as written; its arrow opens it', async ({
    page,
    fake,
  }) => {
    await open(
      page,
      fake,
      '# Toggles\n\n<details>\n<summary>More</summary>\n\nHidden text.\n\n</details>\n\nAfter.\n',
    )
    const editor = page.locator('.cm-content')
    await expect(editor.locator('.cm-details-summary')).toHaveText('More')
    await expect(editor).not.toContainText('<details>')
    await expect(editor).not.toContainText('Hidden text.')
    await editor.getByRole('button', { name: 'Open More' }).click()
    await expect(editor).toContainText('Hidden text.')
    await editor.getByRole('button', { name: 'Close More' }).click()
    await expect(editor).not.toContainText('Hidden text.')
  })
})
