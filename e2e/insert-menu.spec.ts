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
  // Above Table (hidden, still in the list), then above Mention a leaf.
  await page.getByRole('button', { name: 'Move Code block up' }).click()
  await page.getByRole('button', { name: 'Move Code block up' }).click()

  await page.getByRole('button', { name: 'New block' }).click()
  const form = page.getByRole('form', { name: 'Block' })
  await form.getByLabel('Name').fill('Decisions')
  await form.getByLabel('Markdown').fill('## Decisions\n\n- [ ] ')
  await form.getByRole('button', { name: 'Save block' }).click()
  await expect(form).toHaveCount(0)
  for (let i = 0; i < 12; i++) {
    const up = page.getByRole('button', { name: 'Move Decisions up' })
    if (await up.isDisabled()) break
    await up.click()
  }
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
