// Issue #69: with more than one Family, the app opens on all of them together, each in its
// own ring; a node opens in its Family's Peek, and its edits save to its own repository.
// Settings › Views can make this device open on the last Family instead.

import { expect, familyMenu, isPhone, signIn, test } from './fixtures'

test.beforeEach(async ({ fake }) => {
  await fake.addRepo('you/art', {
    '.yeraz.json': '{"name":"Art"}\n',
    'Baroque/caravaggio.md': '# Caravaggio\n\nLight and dark.\n',
    'Baroque/bernini.md': '# Bernini\n',
  })
})

test('opens on every Family together, each in its own ring', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/#\/all$/)
  await expect(page.locator('[data-group]')).toHaveCount(2)
  await expect(page.locator('[data-group="you/art"] text')).toHaveText('Art')
  await expect(page.locator('[data-group="you/engineering"] text')).toHaveText('Engineering')
  await expect(page.locator('[data-node][data-id="you/art::Baroque/caravaggio.md"]')).toHaveCount(1)
  await expect(page.locator('[data-node][data-id^="you/engineering::"]').first()).toBeAttached()
  await expect(await familyMenu(page)).toContainText('All Families')
})

test('a node opens in its own Family, and its edits save there', async ({ page, fake }) => {
  test.skip(isPhone(page), 'Typing tests run on desktop engines')
  await signIn(page)
  await page.goto('./#/all/you/art/Baroque/caravaggio.md')
  await expect(page.getByRole('heading', { name: 'Caravaggio' })).toBeVisible()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\nChiaroscuro.')
  await page.getByRole('button', { name: 'Save now' }).click()
  await expect
    .poll(() => fake.repo('you/art').read('Baroque/caravaggio.md'))
    .toContain('Chiaroscuro.')
})

test('Settings › Views can open the app on the last Family instead', async ({ page }) => {
  await signIn(page)
  await page.goto('./#/tree/you/art')
  await expect(page.locator('[data-map]')).toBeVisible()
  await page.goto('./#/settings/views')
  await page.getByRole('radio', { name: /The last Family/ }).check()
  await page.goto('./#/')
  await expect(page).toHaveURL(/#\/tree\/you\/art$/)

  await page.goto('./#/settings/views')
  await page.getByRole('radio', { name: /All Families/ }).check()
  await page.goto('./#/')
  await expect(page).toHaveURL(/#\/all$/)
})
