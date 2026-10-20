// The leaf's icon and cover, each one button (owner's request): the icon itself, once there
// is one (an emoji, an image, where it sits over the cover, remove it), and Change cover
// (another image, reposition, remove). An image icon shows on the map, in its dot. Flags are drawn even
// where the system has none (Windows: ui/flags.ts).

import type { Page } from '@playwright/test'
import { expect, signInHere, test } from './fixtures'

const REPO = 'you/engineering'
const LEAF = 'Identity/armenia.md'
const TEXT = '# 🇦🇲 Armenia\n\nMount Ararat.\n'

async function open(page: Page, fake: import('../test/fake-github/fakeGitHub').FakeGitHub) {
  await fake.repo(REPO).commit({ message: 'a', additions: [{ path: LEAF, contents: TEXT }] })
  await page.goto(`./#/tree/${REPO}/${LEAF}`)
  await signInHere(page)
  await expect(page.locator('.cm-content')).toContainText('Mount Ararat')
}

/** A small PNG, made in the page. */
const png = (page: Page, w: number, h: number) =>
  page
    .evaluate(
      ([w, h]) => {
        const canvas = document.createElement('canvas')
        canvas.width = w!
        canvas.height = h!
        canvas.getContext('2d')!.fillRect(0, 0, w!, h!)
        return canvas.toDataURL('image/png')
      },
      [w, h],
    )
    .then((url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))

const saved = (fake: import('../test/fake-github/fakeGitHub').FakeGitHub) =>
  fake.repo(REPO).read(LEAF)

test.describe('icon and cover', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines')

  test('an image icon replaces the emoji, sits where chosen, and shows on the map', async ({
    page,
    fake,
  }) => {
    await open(page, fake)
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /^Change icon/ }).click()
    await page.getByRole('menuitem', { name: 'Upload an image' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'ararat.png',
      mimeType: 'image/png',
      buffer: await png(page, 64, 64),
    })
    await page.getByRole('button', { name: /^Change icon/ }).click()
    await page.getByRole('menuitemradio', { name: 'Centre' }).click()
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => saved(fake))
      .toMatch(
        /^# Armenia\n<!-- yeraz \{"icon":"\/assets\/\d{4}-\d{2}-\d{2}-ararat\.png","iconPosition":"center"\} -->\n\nMount Ararat\.\n$/,
      )
    // On the map, the image fills the leaf's dot.
    // The selected leaf is also copied above the selection's veil: both show it.
    const images = page.locator(`[data-map] [data-node][data-id="${LEAF}"] image`)
    await expect(images.first()).toHaveAttribute('href', /^blob:/)
    for (const image of await images.all()) await expect(image).toHaveAttribute('href', /^blob:/)

    // Remove icon takes the image and its place away.
    await page.getByRole('button', { name: /^Change icon/ }).click()
    await page.getByRole('menuitem', { name: 'Remove icon' }).click()
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => saved(fake)).toBe('# Armenia\n\nMount Ararat.\n')
  })

  test('the icon itself opens its choices, nothing else does; Remove icon is one of them', async ({
    page,
    fake,
  }) => {
    await open(page, fake)
    await expect(page.getByRole('button', { name: 'Add icon' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Change icon 🇦🇲' }).click()
    const menu = page.getByRole('menu', { name: 'Change icon 🇦🇲' })
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Choose an emoji',
      'Upload an image',
      'Remove icon',
    ])
    await menu.getByRole('menuitem', { name: 'Remove icon' }).click()
    await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => saved(fake)).toBe('# Armenia\n\nMount Ararat.\n')
  })

  test('the cover is one button: upload, reposition and remove are in it', async ({
    page,
    fake,
  }) => {
    await open(page, fake)
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Add cover' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'ararat.png',
      mimeType: 'image/png',
      buffer: await png(page, 1500, 1000),
    })
    const change = page.getByRole('button', { name: 'Change cover' })
    await change.click()
    const menu = page.getByRole('menu', { name: 'Change cover' })
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Upload an image',
      'Reposition',
      'Remove cover',
    ])
    await menu.getByRole('menuitem', { name: 'Remove cover' }).click()
    await expect(page.getByRole('button', { name: 'Add cover' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reposition' })).toHaveCount(0)
  })
})

test.describe('flags on Windows', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  })
  test.skip(({ browserName }) => browserName !== 'chromium', 'A Windows browser is Chromium here')

  test('draws flags with the bundled Noto flags', async ({ page, fake }) => {
    await open(page, fake)
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.fonts].filter((f) => f.family.includes('Yeraz Flags')).map((f) => f.status),
        ),
      )
      .toEqual(['loaded'])
  })
})

test.describe('a Tree’s icon and cover', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines')

  test('a folder Tree keeps them in its README.md, and its core shows the icon', async ({
    page,
    fake,
    graph,
  }) => {
    const tree = graph.nodes
      .get('')!
      .children.find((id) => graph.nodes.get(id)!.kind === 'branch' && !graph.nodes.get(id)!.sha)!
    await page.goto(`./#/tree/${REPO}/${tree}`)
    await signInHere(page)
    const peek = page.getByRole('region', { name: 'Tree preview' })
    await peek.getByRole('button', { name: 'Add icon' }).click()
    await peek.getByRole('menuitem', { name: 'Choose an emoji' }).click()
    await peek.getByRole('searchbox', { name: 'Search emoji' }).fill('robot')
    // Enter picks the first emoji found, once the list has loaded.
    await expect(peek.getByRole('button', { name: 'robot' })).toBeVisible()
    await peek.getByRole('searchbox', { name: 'Search emoji' }).press('Enter')

    const chooser = page.waitForEvent('filechooser')
    await peek.getByRole('button', { name: 'Add cover' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: await png(page, 1200, 400),
    })
    await expect(peek.getByRole('button', { name: 'Change cover' })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+s')
    // The README starts from the branch's name; its line 1 never renames the branch.
    await expect
      .poll(() => fake.repo(REPO).read(`${tree}/README.md`))
      .toMatch(
        new RegExp(
          `^# 🤖 ${graph.nodes.get(tree)!.title}\\n<!-- yeraz \\{"cover":"/assets/\\d{4}-\\d{2}-\\d{2}-cover\\.png"\\} -->\\n`,
        ),
      )
    await expect(page.locator(`[data-map] > svg [data-tree="${tree}"] [data-core]`)).toContainText(
      '🤖',
    )
    await expect(peek.getByRole('heading', { level: 2 })).toHaveText(graph.nodes.get(tree)!.title)
  })
})
