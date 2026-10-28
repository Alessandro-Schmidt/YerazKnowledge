// Projects: one tab per Family under the top bar, to move between them; + makes a new
// one (the introduction), × removes one from this device.

import { expect, isPhone, signIn, test } from './fixtures'

test.beforeEach(async ({ fake, page }) => {
  // Every Family together, on phones too, so both tabs and All are on screen.
  if (isPhone(page)) await page.addInitScript(() => localStorage.setItem('yeraz-open', 'all'))
  await fake.addRepo('you/art', {
    '.yeraz.json': '{"name":"Art"}\n',
    'Baroque/caravaggio.md': '# Caravaggio\n',
  })
})

test('a tab per project moves between them, with All first', async ({ page }) => {
  await signIn(page)
  const tabs = page.getByRole('navigation', { name: 'Projects' })
  const links = tabs.getByRole('link')
  await expect(links).toHaveText(['All', 'Art', 'Engineering', ''])
  await expect(links.last()).toHaveAccessibleName('New project')
  await expect(tabs.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
  await tabs.getByRole('link', { name: 'Art' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/art$/)
  await expect(tabs.getByRole('link', { name: 'Art' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('[data-node][data-id="Baroque/caravaggio.md"]')).toHaveCount(1)
  await tabs.getByRole('link', { name: 'Engineering' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
})

test('+ makes a new project: the introduction, GitHub or a folder', async ({ page }) => {
  await signIn(page)
  await page
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('link', { name: 'New project' })
    .click()
  await expect(page).toHaveURL(/#\/welcome$/)
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create a new repository' })).toBeVisible()
})

test('× on a tab removes that project from this device', async ({ page, fake }) => {
  await signIn(page)
  const tabs = page.getByRole('navigation', { name: 'Projects' })
  await tabs.getByRole('button', { name: 'Remove Art' }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove Art' })
  await expect(dialog).toContainText('stays on GitHub')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(dialog).toHaveCount(0)
  // One Family left: no All tab, and the map shows it alone.
  await expect(tabs.getByRole('link')).toHaveText(['Engineering', ''])
  await expect(page).toHaveURL(/#\/tree\/you\/engineering$/)
  expect(fake.repo('you/art').read('.yeraz.json')).toContain('Art')
})
