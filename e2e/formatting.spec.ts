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

test('Ctrl/⌘+K in the editor is the link shortcut, not Search', async ({ page }) => {
  test.skip(isPhone(page), 'Keyboard tests run on desktop engines')
  await page.locator('.cm-content').getByText('Make this word strong.').click()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
})

test('bullets draw as bullets, the dash shown only under the cursor', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await expect(editor.locator('.cm-bullet')).toHaveCount(2)
  await expect(editor).not.toContainText('- one')
  await editor.getByText('one').click()
  await page.keyboard.press('Home')
  await expect(editor).toContainText('- one')
})

test('on a phone, a bar above the keyboard formats the selection', async ({ page, fake }) => {
  test.skip(!isPhone(page), 'The bar is for touch screens')
  const editor = page.locator('.cm-content')
  const bar = page.getByRole('toolbar', { name: 'Formatting' })
  await expect(bar).toHaveCount(0)
  await editor.getByText('Make this word strong.').click()
  await expect(bar).toBeVisible()
  // Just above the bottom of what is visible (the keyboard's edge on a real phone).
  const box = (await bar.boundingBox())!
  expect(Math.round(box.y + box.height)).toBe(page.viewportSize()!.height)
  await page.keyboard.press('Home')
  for (let i = 0; i < 'Make this '.length; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 'word'.length; i++) await page.keyboard.press('Shift+ArrowRight')
  await bar.getByRole('button', { name: 'Bold' }).click()
  await expect(editor).toBeFocused()
  await bar.getByRole('button', { name: 'To-do' }).click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('- [ ] Make this **word** strong.')
})

test('a code block hides its fences; its language is picked, and colours its keywords', async ({
  page,
  fake,
}) => {
  await fake.repo(REPO).commit({
    message: 'c',
    additions: [
      { path: LEAF, contents: '# Format\n\nBefore.\n\n```js\nconst x = 1\n```\n\nAfter.\n' },
    ],
  })
  await page.reload()
  const editor = page.locator('.cm-content')
  // On the block's right: the language's logo and name, picked from a menu like the insert menu.
  const language = editor.getByRole('button', { name: 'Code language' })
  await expect(language).toHaveText('JavaScript')
  await expect(language.locator('svg')).toHaveCount(1)
  await expect(editor).not.toContainText('```')
  await expect(editor.locator('.tok-keyword', { hasText: 'const' })).toHaveCount(1)
  // Writing in it keeps the fences hidden.
  await editor.getByText('const x = 1').click()
  await expect(editor).not.toContainText('```')
  await language.click()
  const languages = page.getByRole('menu', { name: 'Code language' })
  await expect(languages.getByRole('menuitem', { name: 'Rust' }).locator('svg')).toHaveCount(1)
  await languages.getByRole('menuitem', { name: 'Python', exact: true }).click()
  await expect(languages).toHaveCount(0)
  await expect(language).toHaveText('Python')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('```python\nconst x = 1\n```')
  await expect(editor.locator('.tok-keyword', { hasText: 'const' })).toHaveCount(0)
})

test('Tab nests a list item under the one above, Shift+Tab brings it out', async ({
  page,
  fake,
}) => {
  test.skip(isPhone(page), 'Keyboard tests run on desktop engines')
  const editor = page.locator('.cm-content')
  await editor.getByText('two').click()
  await page.keyboard.press('Tab')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('- one\n  - two\n')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('- one\n- two\n')
})

test('on a phone, the bar indents and outdents a list item', async ({ page, fake }) => {
  test.skip(!isPhone(page), 'The bar is for touch screens')
  const editor = page.locator('.cm-content')
  const bar = page.getByRole('toolbar', { name: 'Formatting' })
  await editor.getByText('two').click()
  await bar.getByRole('button', { name: 'Indent' }).click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('- one\n  - two\n')
  await bar.getByRole('button', { name: 'Outdent' }).click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(LEAF)).toContain('- one\n- two\n')
})
