// Formatting while writing (editor/format.ts): shortcuts and marks typed over a selection.

import { expect, isPhone, signInHere, test } from './fixtures'

const REPO = 'you/engineering'
const LEAF = 'Identity/format.md'

test.beforeEach(async ({ page, fake }) => {
  await fake.repo(REPO).commit({
    message: 'f',
    additions: [{ path: LEAF, contents: '# Format\n\nMake this word strong.\n\n- one\n- two\n' }],
  })
  await page.goto(`./#/tree/${REPO}/${LEAF}`)
  await signInHere(page)
  await expect(page.locator('.cm-content')).toContainText('Make this word strong.')
})

test('Ctrl/⌘+B wraps the selection, again takes it off; a typed * wraps it too', async ({
  page,
  fake,
}) => {
  test.skip(isPhone(page), 'Typing tests run on desktop engines')
  const editor = page.locator('.cm-content')
  await editor.getByText('Make this word strong.').click()
  await page.keyboard.press('Home')
  for (let i = 0; i < 'Make this '.length; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 'word'.length; i++) await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('Make this **word** strong.')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('*')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('Make this *word* strong.')
})

test('bullets draw as bullets, the dash shown only under the cursor', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await expect(editor.locator('.cm-bullet')).toHaveCount(2)
  await expect(editor).not.toContainText('- one')
  await editor.getByText('one').click()
  await page.keyboard.press('Home')
  await expect(editor).toContainText('- one')
})
