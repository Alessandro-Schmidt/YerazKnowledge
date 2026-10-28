// The Family menu's Rename and Remove (owner's request): a Family is renamed where it is
// shown, and taken off this device without touching GitHub.

import { expect, familyMenu, signIn, test } from './fixtures'

const REPO = 'you/engineering'

test('renames the Family from its menu: the name changes everywhere, written to .yeraz.json', async ({
  page,
  fake,
}) => {
  await signIn(page)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Rename Family' }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename Family' })
  await dialog.getByLabel(/^Name/).fill('Platform')
  await dialog.getByRole('button', { name: 'Rename' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Platform')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read('.yeraz.json')).toContain('"name":"Platform"')
  await expect(await familyMenu(page)).toContainText('Platform')
})

test('removes the Family from this device: GitHub keeps it, and it is not found again', async ({
  page,
  fake,
}) => {
  await signIn(page)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Remove Family' }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove Engineering' })
  await expect(dialog).toContainText('stays on GitHub')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  // No Family left: the introduction.
  await expect(page).toHaveURL(/#\/welcome$/)
  expect(fake.repo(REPO).read('.yeraz.json')).toContain('Engineering')
  await expect(page.getByRole('link', { name: 'Back to your notes' })).toHaveCount(0)

  // Reloading looks for Families again: this one stays off, until connected by hand.
  await page.goto('./')
  await page.reload()
  await expect(page).toHaveURL(/#\/welcome$/)
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  await page.getByRole('button', { name: 'Connect repository' }).click()
  await page.getByPlaceholder('owner/name').fill(REPO)
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
})

test('renames the repository on GitHub from the same dialog: the Family moves with it', async ({
  page,
  fake,
}) => {
  await signIn(page)
  await page.goto(`./#/tree/${REPO}`)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Rename Family' }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename Family' })
  await dialog.getByLabel('Repository').fill('platform')
  await dialog.getByRole('button', { name: 'Rename' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/#\/tree\/you\/platform$/)
  expect(fake.repo('you/platform').read('.yeraz.json')).toContain('Engineering')
  await expect(page.locator('[data-map]')).toBeVisible()
  await expect(await familyMenu(page)).toContainText('you/platform')
  await page.keyboard.press('Escape')
  // A taken name is refused with GitHub's words, and nothing moves.
  await fake.addRepo('you/taken')
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Rename Family' }).click()
  await dialog.getByLabel('Repository').fill('taken')
  await dialog.getByRole('button', { name: 'Rename' }).click()
  await expect(dialog.getByRole('alert')).toContainText('name already exists')
})

test('connects a repository without .yeraz.json from the Family menu, after asking', async ({
  page,
  fake,
}) => {
  await fake.addRepo('you/dotfiles', { 'README.md': '# dotfiles\n' })
  await signIn(page)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Connect repository' }).click()
  const dialog = page.getByRole('dialog', { name: 'Connect repository' })
  await dialog.getByPlaceholder('owner/name').fill('you/dotfiles')
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog).toContainText('into a notebook?')
  await dialog.getByRole('button', { name: 'Turn into a notebook' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/dotfiles$/)
  expect(fake.repo('you/dotfiles').read('notes/dotfiles/welcome.md')).toContain('# 🌱 Welcome')
})
