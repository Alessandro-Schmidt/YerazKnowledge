// Templates for new leaves (issue #41): `.md` files in `.yeraz/templates/`, kept in the
// Family. New leaf starts from one, with its variables filled; Settings › Templates makes,
// edits, copies and deletes them; a leaf's ⋯ menu saves it as one.

import { expect, signInHere, test } from './fixtures'

const REPO = 'you/notes'
const MEETING =
  '# 📝 Meeting\n<!-- yeraz {"color":{"heading":"amber"}} -->\n\n{{title}} · {{date}} · {{tree}}\n\n## Decisions\n'
const FILES = {
  '.yeraz.json': '{"name":"Notes"}',
  '.yeraz/templates/meeting.md': MEETING,
  'Work/plan.md': '# 🗓️ Plan\n\nGoals for the year.\n',
}

test.beforeEach(async ({ fake }) => {
  await fake.addRepo(REPO, FILES)
})

test('New leaf starts from a template: its emoji and look, the title, the date and the Tree filled in', async ({
  page,
  fake,
}) => {
  await page.goto(`./#/tree/${REPO}/Work%2Fplan.md`)
  await signInHere(page)
  const peek = page.getByRole('region', { name: 'Leaf preview' })
  // The template is not a leaf: nowhere on the map or in the Explorer.
  await expect(
    page.locator('[data-map] [data-node][data-id="Work/plan.md"]').first(),
  ).toBeAttached()
  await expect(page.locator('[data-map] [data-id^=".yeraz"]')).toHaveCount(0)
  await expect(page.getByRole('treeitem', { name: /Meeting/ })).toHaveCount(0)
  await peek.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'Add sub-leaf' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: /^Title/ }).fill('Sprint review')
  await dialog.getByRole('combobox', { name: /^Start from/ }).selectOption({ label: '📝 Meeting' })
  await dialog.getByRole('button', { name: 'Create leaf' }).click()
  await expect(page).toHaveURL(/Work(\/|%2F)plan(\/|%2F)sprint-review\.md$/)
  await expect(page.locator('.cm-title')).toContainText('Sprint review')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('Work/plan/sprint-review.md'))
    .toMatch(
      /^# 📝 Sprint review\n<!-- yeraz \{"color":\{"heading":"amber"\}\} -->\n\nSprint review · \d{4}-\d{2}-\d{2} · Work\n\n## Decisions\n$/,
    )
})

test('Settings › Templates makes a template, edits it in the leaf’s editor, and deletes it', async ({
  page,
  fake,
}) => {
  await page.goto('./#/settings/templates')
  await signInHere(page)
  const list = page.getByRole('group', { name: 'Templates in Notes' })
  await expect(list.getByText('📝 Meeting')).toBeVisible()
  await list.getByRole('button', { name: 'New template' }).click()
  await list.getByLabel('Template name').fill('Book notes')
  await list.getByRole('button', { name: 'Create template' }).click()
  await expect(list).toContainText('.yeraz/templates/book-notes.md')
  const editor = page.getByRole('region', { name: 'Template editor' })
  await expect(editor).toContainText('Editing Book notes')
  await expect(editor.locator('.cm-title')).toContainText('Book notes')
  await editor.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('Read on {{date}}.')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('.yeraz/templates/book-notes.md'))
    .toBe('# Book notes\n\nRead on {{date}}.')
  await editor.getByRole('button', { name: 'Done' }).click()
  await expect(editor).toHaveCount(0)

  page.on('dialog', (d) => void d.accept())
  await list.getByRole('button', { name: 'Delete Book notes' }).click()
  await expect(list).not.toContainText('Book notes')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read('.yeraz/templates/book-notes.md')).toBeUndefined()
})

test('a leaf is saved as a template from its ⋯ menu, and opens in Settings › Templates to edit', async ({
  page,
  fake,
}) => {
  await page.goto(`./#/tree/${REPO}/Work%2Fplan.md`)
  await signInHere(page)
  const peek = page.getByRole('region', { name: 'Leaf preview' })
  await peek.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'Save as template' }).click()
  await expect(page).toHaveURL(
    /#\/settings\/templates\/you\/notes\/\.yeraz(\/|%2F)templates(\/|%2F)plan\.md$/,
  )
  const editor = page.getByRole('region', { name: 'Template editor' })
  await expect(editor).toContainText('Editing Plan')
  await expect(editor.locator('.cm-title')).toContainText('Plan')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('.yeraz/templates/plan.md'))
    .toBe(FILES['Work/plan.md'])
  // The leaf itself is untouched, and still the only leaf.
  expect(fake.repo(REPO).read('Work/plan.md')).toBe(FILES['Work/plan.md'])
})

test('a template is copied to another Family, so it travels with that repository too', async ({
  page,
  fake,
}) => {
  await fake.addRepo('you/art', { '.yeraz.json': '{"name":"Art"}', 'Baroque.md': '# Baroque\n' })
  await page.goto('./#/settings/templates')
  await signInHere(page)
  await page.getByLabel('Family', { exact: true }).selectOption({ label: 'Notes · you/notes' })
  const list = page.getByRole('group', { name: 'Templates in Notes' })
  await list.getByLabel('Copy Meeting to another Family').selectOption({ label: 'Art' })
  await expect(page.getByRole('status')).toHaveText('Copied to Art.')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo('you/art').read('.yeraz/templates/meeting.md')).toBe(MEETING)
  await page.getByLabel('Family', { exact: true }).selectOption({ label: 'Art · you/art' })
  await expect(page.getByRole('group', { name: 'Templates in Art' })).toContainText('📝 Meeting')
})
