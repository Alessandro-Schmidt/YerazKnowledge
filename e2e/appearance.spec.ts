import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, familyMenu, signIn, test } from './fixtures'

declare global {
  interface Window {
    __commits: number
    __firstFrame?: Record<string, string | undefined>
  }
}

// Counts React commits through the hook React DevTools uses; production builds call it too.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.__commits = 0
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      value: {
        supportsFiber: true,
        isDisabled: false,
        renderers: new Map(),
        inject: () => 1,
        onScheduleFiberRoot() {},
        onCommitFiberRoot: () => void window.__commits++,
        onCommitFiberUnmount() {},
        onPostCommitFiberRoot() {},
        checkDCE() {},
      },
    })
  })
})

async function openAppearance(page: Page) {
  await signIn(page)
  await (await familyMenu(page)).getByRole('menuitem', { name: 'Appearance' }).click()
  await expect(page.getByRole('heading', { name: 'Appearance', level: 1 })).toBeVisible()
}

test('switching theme applies at once, re-renders nothing and is kept', async ({ page }) => {
  await openAppearance(page)
  const before = await page.evaluate(() => window.__commits)
  expect(before).toBeGreaterThan(0) // the counter is live

  await page.getByRole('radio', { name: /Paper/ }).check()
  await page.getByRole('radio', { name: 'Violet' }).check()
  await page.getByRole('radio', { name: /Newsreader/ }).check()

  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-base', 'paper')
  await expect(html).toHaveAttribute('data-mode', 'light')
  await expect(html).toHaveAttribute('data-accent', 'violet')
  await expect(html).toHaveAttribute('data-font', 'serif')
  await expect(page.getByText('Paper · Violet · contrast AA')).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(243, 241, 235)',
  )
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "Newsreader Variable"')))
    .toBe(true)
  expect(await page.evaluate(() => window.__commits)).toBe(before)

  await page.reload()
  await expect(page.getByRole('radio', { name: /Paper/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Violet' })).toBeChecked()
  await expect(page.getByRole('radio', { name: /Newsreader/ })).toBeChecked()
})

test('the saved theme is on <html> before the first paint', async ({ page, context }) => {
  await context.addInitScript(() => {
    // The moment <body> is parsed, before any module script or paint.
    new MutationObserver((_, observer) => {
      if (!document.body) return
      window.__firstFrame = { ...document.documentElement.dataset }
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('./')
  await page.evaluate(() =>
    localStorage.setItem(
      'yeraz-theme',
      JSON.stringify({ base: 'graphite', accent: 'blue', font: 'serif', mode: 'dark' }),
    ),
  )
  await page.reload()
  expect(await page.evaluate(() => window.__firstFrame)).toEqual({
    base: 'graphite',
    mode: 'dark',
    accent: 'blue',
    font: 'serif',
  })
})

test('Done returns to the Family', async ({ page }) => {
  await openAppearance(page)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'Engineering', level: 1 })).toBeVisible()
})

test('the Appearance screen has no accessibility violations', async ({ page }) => {
  await openAppearance(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test.describe('custom theme', () => {
  const body = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  test('created from the current theme, edited with contrast checks, kept with no flash', async ({
    page,
    context,
  }) => {
    await openAppearance(page)
    await page.getByRole('button', { name: 'Create from current' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-custom', '')
    await expect(page.getByText('My theme · custom · contrast AA')).toBeVisible()

    await page.getByLabel('Page', { exact: true }).fill('#102030')
    await expect.poll(() => body(page)).toBe('rgb(16, 32, 48)')
    await page.getByLabel('Secondary text').fill('#111111')
    await expect(
      page.getByText(/Adjusted to stay readable: Secondary text #111111 → #/),
    ).toBeVisible()

    await context.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (!document.body) return
        window.__firstFrame = {
          ...document.documentElement.dataset,
          style: document.getElementById('yeraz-custom') ? 'yes' : 'no',
        }
        observer.disconnect()
      }).observe(document, { childList: true, subtree: true })
    })
    await page.reload()
    expect(await page.evaluate(() => window.__firstFrame)).toMatchObject({
      custom: '',
      style: 'yes',
    })
    expect(await body(page)).toBe('rgb(16, 32, 48)')
    await expect(page.getByLabel('Page', { exact: true })).toHaveValue('#102030')
  })

  test('imported, exported, picked from the community, and left for a built-in theme', async ({
    page,
  }) => {
    const midnight = readFileSync('themes/midnight.json', 'utf8')
    await openAppearance(page)

    let chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import…' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'oops.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"name":"x"}'),
    })
    await expect(page.getByRole('alert')).toHaveText('This is not a Yeraz theme.')

    chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import…' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'midnight.json',
      mimeType: 'application/json',
      buffer: Buffer.from(midnight),
    })
    await expect(page.getByText('Midnight · custom · contrast AA')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-base', 'graphite')
    await expect.poll(() => body(page)).toBe('rgb(14, 17, 22)')

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('midnight.json')
    const chunks: Buffer[] = []
    for await (const chunk of (await file.createReadStream())!) chunks.push(chunk as Buffer)
    expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(JSON.parse(midnight))

    await page.getByRole('button', { name: 'Stop using it' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-custom')
    await page.getByRole('button', { name: 'Sepia' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-base', 'paper')
    await expect(page.locator('html')).toHaveAttribute('data-font', 'serif')
    await expect(page.getByRole('radio', { name: /Paper/ })).toBeChecked()

    await page.getByRole('radio', { name: /Vanta/ }).check()
    await expect(page.locator('html')).not.toHaveAttribute('data-custom')
    await expect(page.getByText(/^Vanta · /)).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-custom')
  })
})
