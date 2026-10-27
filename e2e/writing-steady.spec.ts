// Writing on a phone (owner's request): the note takes the screen when written in, and the
// line being written keeps its place on it (editor/steady.ts).

import type { Page } from '@playwright/test'
import { expect, isPhone, signInHere, test } from './fixtures'

const REPO = 'you/engineering'
const LEAF = 'Identity/steady.md'
const TEXT = '# Steady\n\nBefore.\n\n- one\n- two\n\nAfter.\n'

async function open(page: Page, fake: import('../test/fake-github/fakeGitHub').FakeGitHub) {
  await fake.repo(REPO).commit({ message: 'a leaf', additions: [{ path: LEAF, contents: TEXT }] })
  await page.goto(`./#/tree/${REPO}/${LEAF}`)
  await signInHere(page)
  await expect(page.locator('.cm-content')).toContainText('Before.')
}

test.describe('on a phone', () => {
  test('writing in the sheet opens the note to the full page', async ({ page, fake }) => {
    test.skip(!isPhone(page), 'The bottom sheet is on phones')
    await open(page, fake)
    const peek = page.getByRole('region', { name: 'Leaf preview' })
    await expect(peek).not.toHaveAttribute('data-expanded')
    await page.locator('.cm-content').getByText('Before.').click()
    await expect(peek).toHaveAttribute('data-expanded')
  })

  test('the line being written keeps its place on the screen, in a list too', async ({
    page,
    fake,
  }) => {
    test.skip(!isPhone(page), 'Touch screens keep the caret at eye level')
    await open(page, fake)
    const editor = page.locator('.cm-content')
    await editor.getByText('two').click()
    await page.keyboard.press('End')
    /** The caret's top on the screen. */
    const caretTop = () =>
      page.evaluate(() => getSelection()!.getRangeAt(0).getClientRects()[0]!.top)
    // Enough items that the text must scroll; then every new line lands where the last was.
    for (let i = 0; i < 25; i++) await page.keyboard.type('\nitem')
    const settled = await caretTop()
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type('\nmore')
      // The text moves under the caret in the editor's next measure frame.
      await expect.poll(async () => Math.abs((await caretTop()) - settled)).toBeLessThan(2)
    }
    const panel = page.locator('[class*="_scroll_"]').first()
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  })
})

test('on a phone, the full page shows the sync state and Save, since it covers the top bar', async ({
  page,
  fake,
}) => {
  test.skip(!isPhone(page), 'The bottom sheet is on phones')
  await open(page, fake)
  const peek = page.getByRole('region', { name: 'Leaf preview' })
  await page.locator('.cm-content').getByText('After.').click()
  await expect(peek).toHaveAttribute('data-expanded')
  await expect(peek).toContainText('Synced to main')
  const save = peek.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeDisabled()
  await page.keyboard.press('End')
  await page.keyboard.type(' More.')
  await expect(peek).toContainText('Unsaved edits')
  await expect(save).toBeEnabled()
  await save.click()
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('After. More.')
})
