// A Family kept on a device whose browser can't open folders (phones, Safari, Firefox): in
// the browser's own storage, started empty or from a copy of a folder's files.

import { mkdir, writeFile } from 'node:fs/promises'
import { expect, familyMenu, test } from './fixtures'

test.skip(
  ({ browserName, isMobile }) => browserName === 'chromium' && !isMobile,
  'Chrome on a computer opens real folders (folder.spec.ts)',
)

test.beforeEach(async ({ page }) => {
  // Android's Chrome has no folder picker; Playwright's Chromium does.
  await page.addInitScript(
    () => delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker,
  )
})

test('starts a Family on the device, writes to it, and reopens on it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByLabel('Name').fill('Notes')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page).toHaveURL(/#\/tree\/~\/notes$/)

  await page.goto('./#/tree/~/notes/welcome.md')
  const editor = page.locator('.cm-content')
  const status = page.getByRole('status').first()
  await editor.getByText('This is the first leaf').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Kept here.')
  await expect(status).toContainText('Unsaved edits')
  await expect(status).toContainText('Saved on this device', { timeout: 10_000 })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toHaveCount(0)
  await page.goto('./#/tree/~/notes/welcome.md')
  await expect(page.locator('.cm-content')).toContainText('Kept here.')
})

test('copies in a folder of notes, named after it', async ({ page }, info) => {
  const vault = info.outputPath('Vault')
  await mkdir(`${vault}/Ideas`, { recursive: true })
  await mkdir(`${vault}/.obsidian`, { recursive: true })
  await writeFile(`${vault}/Ideas/first.md`, '# First idea\n\nHello.\n')
  await writeFile(`${vault}/.obsidian/app.json`, '{}')
  await page.goto('./')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByRole('button', { name: 'Copy in a folder' }).click()
  // WebKit now and then never answers a folder's setFiles although the page got the files
  // (CI runs 40516518655, 39866726554): what the files lead to is waited for, not the call.
  void (await chooser).setFiles(vault).catch(() => undefined)
  await expect(page).toHaveURL(/#\/tree\/~\/vault$/)
  await page.goto('./#/tree/~/vault/Ideas/first.md')
  await expect(page.locator('.cm-content')).toContainText('Hello.')
})

test('starts a Family with a name of its own, and deletes it from the device on removal', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByLabel('Name').fill('Recipes')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page).toHaveURL(/#\/tree\/~\/recipes$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Recipes')

  await familyMenu(page)
  await page.getByRole('menuitem', { name: 'Remove Family' }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove Recipes' })
  await expect(dialog).toContainText('stay on this device')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  // The last Family on a device without GitHub: back to the introduction, where the Folder
  // step opens the closed project again, notes kept.
  await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open Recipes again' }).click()
  await expect(page).toHaveURL(/#\/tree\/~\/recipes$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Recipes')

  // Deleted from the device: gone from the Folder step too.
  await page
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: 'Remove Recipes' })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete from device' }).click()
  await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Recipes again' })).toHaveCount(0)
})

test('Try an example starts the example Family on the device', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByRole('button', { name: 'Try an example' }).click()
  await expect(page).toHaveURL(/#\/tree\/~\/example$/)
  await page.goto('./#/tree/~/example/Welcome.md')
  await expect(page.locator('.cm-content')).toContainText('This is an example Family')
})
