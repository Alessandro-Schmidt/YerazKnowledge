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
    // Writing opens the full page: the text is typed once it is there and still.
    const peek = page.getByRole('region', { name: 'Leaf preview' })
    await expect(peek).toHaveAttribute('data-expanded')
    await peek.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
    await page.keyboard.press('End')
    /** The caret's top on the screen. */
    const caretTop = () =>
      page.evaluate(() => getSelection()!.getRangeAt(0).getClientRects()[0]!.top)
    // Typed at a thumb's pace: the emulated Android drops Enters typed with no delay at all
    // (CodeMirror's deferred Android keys), and a short text never has to scroll.
    const pace = { delay: 30 }
    // Enough items that the text must scroll; then every new line lands where the last was.
    for (let i = 0; i < 25; i++) await page.keyboard.type('\nitem', pace)
    // Each on its own line (the bullet is drawn before it).
    await expect(editor.locator('.cm-line', { hasText: /^\W*item$/ })).toHaveCount(25)
    const settled = await caretTop()
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type('\nmore', pace)
      // The text moves under the caret in the editor's next measure frame.
      await expect.poll(async () => Math.abs((await caretTop()) - settled)).toBeLessThan(2)
    }
    const panel = page.locator('[class*="_scroll_"]').first()
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  })

  test('the full page keeps Back to the map and Dismiss on screen when the keyboard moves it', async ({
    page,
    fake,
  }) => {
    test.skip(!isPhone(page), 'The full page over the screen is on phones')
    await open(page, fake)
    await page.locator('.cm-content').getByText('Before.').click()
    const peek = page.getByRole('region', { name: 'Leaf preview' })
    await expect(peek).toHaveAttribute('data-expanded')
    await peek.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
    // A keyboard opening: the visible part of the screen shrinks, and the browser scrolls the
    // page up by 180 px under it (what iOS does; the emulator has no keyboard to show it).
    await page.evaluate(() => {
      const vv = window.visualViewport!
      const height = vv.height
      Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 180 })
      Object.defineProperty(vv, 'height', { configurable: true, get: () => height - 300 })
      vv.dispatchEvent(new Event('resize'))
    })
    for (const name of ['Back to the map', 'Dismiss']) {
      const box = (await peek.getByRole('button', { name }).boundingBox())!
      // In the visible part: below its top edge, which the page now starts above by 180 px.
      expect(box.y).toBeGreaterThanOrEqual(180)
    }
    const top = await peek.evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBe(180)
    await peek.getByRole('button', { name: 'Dismiss' }).click()
    await expect(peek).toHaveCount(0)
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
