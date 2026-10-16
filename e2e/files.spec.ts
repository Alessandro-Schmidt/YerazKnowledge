// Files attached to a leaf (issue #15): any file goes into assets/ with the leaf that links
// to it, in one commit; it shows as a card that downloads it, in the editor and the read view.

import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, signInHere, test } from './fixtures'

const REPO = 'you/engineering'
const LEAF = 'files.md'
const bytes = (length: number) => Buffer.from(Array.from({ length }, (_, i) => (i * 13) % 256))

const mutations = (fake: { log: { operation?: string }[] }) =>
  fake.log.filter((e) => e.operation === 'mutation')

test.describe('attaching files', () => {
  test.skip(({ isMobile }) => isMobile, 'Adding files runs on desktop engines')

  test.beforeEach(async ({ fake }) => {
    await fake.repo(REPO).commit({
      message: 'files',
      additions: [{ path: LEAF, contents: '# Files\n\nThe quarter in numbers.\n' }],
    })
  })

  async function openEditor(page: Page) {
    await page.goto(`./#/edit/${REPO}/${LEAF}`)
    await signInHere(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
  }

  test('a file from the insert menu is committed byte for byte with the leaf, in one commit', async ({
    page,
    fake,
  }) => {
    await page.clock.install()
    await openEditor(page)
    const sheet = bytes(5000)
    await page.keyboard.down('Control')
    await page.clock.runFor(2000)
    await page.keyboard.up('Control')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Attach a file' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'Q3 report.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: sheet,
    })

    // Away from the cursor, the link is a card: name, type and size.
    const card = page.locator('.cm-content .file-card')
    await expect(card).toContainText('Q3 report.xlsx')
    await expect(card).toContainText('XLSX · 4.9 KB')
    await expect(page.getByRole('status')).toContainText('Unsaved edits')
    // Before the commit, the card downloads the file from this device.
    const download = page.waitForEvent('download')
    await card.click()
    expect(await readFile((await (await download).path())!)).toEqual(sheet)

    fake.resetLog()
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => mutations(fake).length).toBe(1)
    const repo = fake.repo(REPO)
    const path = [...repo.head!.files.keys()].find((p) => p.startsWith('assets/'))!
    expect(path).toMatch(/^assets\/\d{4}-\d{2}-\d{2}-q3-report\.xlsx$/)
    expect(Buffer.from(repo.blobs.get(repo.head!.files.get(path)!)!)).toEqual(sheet)
    expect(repo.read(LEAF)).toBe(
      `# Files\n\nThe quarter in numbers.\n\n[Q3 report.xlsx](/${path})\n`,
    )
  })

  test('the read view shows a card that downloads the file', async ({ page, fake }) => {
    const zip = bytes(3000)
    await fake.repo(REPO).commit({
      message: 'backup',
      additions: [
        { path: 'assets/2026-10-17-backup.zip', contents: new Uint8Array(zip) },
        {
          path: LEAF,
          contents: '# Files\n\n[Backup.zip](/assets/2026-10-17-backup.zip)\n',
        },
      ],
    })
    await page.goto(`./#/tree/${REPO}/${LEAF}`)
    await signInHere(page)
    const card = page
      .getByRole('region', { name: 'Leaf preview' })
      .getByRole('button', { name: 'Download Backup.zip, ZIP · 2.9 KB' })
    await expect(card).toBeVisible()
    const download = page.waitForEvent('download')
    await card.click()
    expect((await download).suggestedFilename()).toBe('2026-10-17-backup.zip')
    expect(await readFile((await (await download).path())!)).toEqual(zip)
  })

  test('a dropped file is added; one over GitHub’s 100 MB limit is refused, saying why', async ({
    page,
    fake,
  }) => {
    await openEditor(page)
    const messages: string[] = []
    page.on('dialog', (dialog) => {
      messages.push(dialog.message())
      void dialog.accept()
    })
    const box = (await page.locator('.cm-content').boundingBox())!
    await page.evaluate(
      ({ x, y }) => {
        const data = new DataTransfer()
        data.items.add(new File([new Uint8Array(101 * 1024 * 1024)], 'film.mov'))
        data.items.add(new File(['id,total\n1,42\n'], 'totals.csv', { type: 'text/csv' }))
        const target = document.querySelector('.cm-content')!
        target.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: data,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      { x: box.x + box.width / 2, y: box.y + box.height - 4 },
    )
    await expect(page.locator('.cm-content .file-card')).toContainText('totals.csv')
    expect(messages).toEqual([
      "film.mov is 101.0 MB. GitHub doesn't accept files over 100 MB, so it can't be added to the Tree.",
    ])

    fake.resetLog()
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => mutations(fake).length).toBe(1)
    const files = [...fake.repo(REPO).head!.files.keys()].filter((p) => p.startsWith('assets/'))
    expect(files).toEqual([expect.stringMatching(/-totals\.csv$/)])
  })
})
