import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, signIn, test } from './fixtures'

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
  await page.getByRole('button', { name: 'Appearance' }).click()
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

test('Done returns to all Trees', async ({ page }) => {
  await openAppearance(page)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'All trees', level: 1 })).toBeVisible()
})

test('the Appearance screen has no accessibility violations', async ({ page }) => {
  await openAppearance(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
