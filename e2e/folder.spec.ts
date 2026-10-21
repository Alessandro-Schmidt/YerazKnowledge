// A Family kept in a folder, without GitHub (issue #64). The folder picker is a native dialog
// Playwright can't drive, so it answers with a folder in the origin-private file system: a
// real FileSystemDirectoryHandle, read and written through the same File System Access API.

import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Folders need the File System Access API: Chrome and Edge on a computer',
)

/** The picker answers with `Notes`, holding `files` (path → text) to start with. */
async function folderPicker(page: Page, files: Record<string, string> = {}) {
  await page.addInitScript((files) => {
    const pick = async () => {
      const root = await navigator.storage.getDirectory()
      const notes = await root.getDirectoryHandle('Notes', { create: true })
      for (const [path, text] of Object.entries(files)) {
        const names = path.split('/')
        let dir = notes
        for (const name of names.slice(0, -1))
          dir = await dir.getDirectoryHandle(name, { create: true })
        const out = await (
          await dir.getFileHandle(names.at(-1)!, { create: true })
        ).createWritable()
        await out.write(text)
        await out.close()
      }
      return notes
    }
    Object.assign(window, { showDirectoryPicker: pick })
  }, files)
}

/** A file's text in the picked folder, or null. */
const readFile = (page: Page, path: string) =>
  page.evaluate(async (path) => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Notes')
    const names = path.split('/')
    try {
      for (const name of names.slice(0, -1)) dir = await dir.getDirectoryHandle(name)
      return await (await (await dir.getFileHandle(names.at(-1)!)).getFile()).text()
    } catch {
      return null
    }
  }, path)

test('uses a folder instead of GitHub: welcomes it, writes edits to it, reopens on it', async ({
  page,
}) => {
  await folderPicker(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open an existing folder' }).click()
  await expect(page.locator('[data-map]')).toBeVisible()
  await expect(page).toHaveURL(/#\/tree\/~\/notes$/)
  expect(await readFile(page, '.yeraz.json')).toBe('{"name":"Notes"}\n')

  await page.goto('./#/tree/~/notes/welcome.md')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\nWritten in a folder.')
  await expect(page.getByRole('status')).toContainText('Saved to the folder')
  await expect.poll(() => readFile(page, 'welcome.md')).toContain('Written in a folder.')

  // No token screen when the app opens again.
  await page.reload()
  await expect(page.locator('[data-map]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toHaveCount(0)
})

test('opens a folder of notes made elsewhere as it is', async ({ page }) => {
  await folderPicker(page, {
    'Ideas/first.md': '# First idea\n\nSee [Second](/Ideas/second.md).\n',
    'Ideas/second.md': '# Second idea\n',
    '.obsidian/app.json': '{}',
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open an existing folder' }).click()
  await expect(page.locator('[data-map]')).toBeVisible()
  await page.goto('./#/tree/~/notes/Ideas/first.md')
  await expect(page.getByRole('heading', { name: 'First idea' })).toBeVisible()
  expect(await readFile(page, 'welcome.md')).toBeNull()
})

test('creates a new project folder by name, where you choose', async ({ page }) => {
  // The picker answers with the place to create it in: the origin-private file system's root.
  await page.addInitScript(() =>
    Object.assign(window, { showDirectoryPicker: () => navigator.storage.getDirectory() }),
  )
  await page.goto('./')
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByLabel('Name').fill('Work notes')
  await page.getByRole('button', { name: 'Choose where to create it…' }).click()
  await expect(page.locator('[data-map]')).toBeVisible()
  await expect(page).toHaveURL(/#\/tree\/~\/work-notes$/)
  const marker = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const made = await root.getDirectoryHandle('Work notes')
    return (await (await made.getFileHandle('.yeraz.json')).getFile()).text()
  })
  expect(marker).toBe('{"name":"Work notes"}\n')

  // The same name again: that folder is there now, and isn't taken over.
  await page.goto('./#/welcome/folder')
  await page.getByLabel('Name').fill('Work notes')
  await page.getByRole('button', { name: 'Choose where to create it…' }).click()
  await expect(page.getByRole('alert')).toContainText("There's already a folder named “Work notes”")
})
