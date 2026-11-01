// Settings › Insert menu (owner's request): the items of the menu held Ctrl/Cmd opens, in the
// person's order, some hidden, and their own blocks of Markdown, inserted from it.

import { expect, signInHere, test } from './fixtures'

const REPO = 'you/notes'

test.skip(({ isMobile }) => isMobile, 'Ctrl/Cmd runs on desktop engines')

test.beforeEach(async ({ fake }) => {
  await fake.addRepo(REPO, {
    '.yeraz.json': '{"name":"Notes"}',
    'Work/standup.md': '# Standup\n\nToday.\n',
  })
})

test('the menu follows Settings: order, hidden items, and a block inserted from it', async ({
  page,
  fake,
}) => {
  await page.goto('./#/settings/menu')
  await signInHere(page)
  const items = page.getByRole('list', { name: 'Menu items' })
  await items.getByRole('checkbox', { name: 'Table' }).uncheck()
  // Dragged by its handle above Mention a leaf (and Table, hidden, still in the list).
  const grip = page.getByRole('button', { name: 'Reorder Code block' })
  const target = await items
    .getByRole('listitem')
    .filter({ hasText: 'Mention a leaf' })
    .boundingBox()
  await grip.hover()
  await page.mouse.down()
  await page.mouse.move(target!.x + 20, target!.y + 4, { steps: 8 })
  await page.mouse.up()
  await expect(items.getByRole('listitem').nth(3)).toContainText('Code block')

  await page.getByRole('button', { name: 'New block' }).click()
  const form = page.getByRole('form', { name: 'Block' })
  await form.getByLabel('Name').fill('Decisions')
  await form.getByLabel('Markdown').fill('## Decisions\n\n- [ ] ')
  await form.getByRole('button', { name: 'Save block' }).click()
  await expect(form).toHaveCount(0)
  // The handle moves with the arrow keys too.
  await page.getByRole('button', { name: 'Reorder Decisions' }).focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp')
  await expect(items.getByRole('listitem').first()).toContainText('Decisions')

  await page.clock.install()
  await page.goto(`./#/tree/${REPO}/Work%2Fstandup.md`)
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.down('Control')
  await page.clock.runFor(1000)
  await page.keyboard.up('Control')
  const menu = page.getByRole('menu', { name: 'Insert' })
  await expect(menu).toBeVisible()
  const labels = await menu.getByRole('menuitem').allTextContents()
  expect(labels.slice(0, 1)).toEqual(['Decisions'])
  expect(labels).not.toContain('Table')
  expect(labels.indexOf('Code block')).toBeLessThan(labels.indexOf('Mention a leaf'))
  // The menu opens on its first item: Enter picks it.
  await expect(menu.getByRole('menuitem', { name: 'Decisions' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ship it')
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('Work/standup.md'))
    .toBe('# Standup\n\nToday.\n## Decisions\n\n- [ ] Ship it')
})
