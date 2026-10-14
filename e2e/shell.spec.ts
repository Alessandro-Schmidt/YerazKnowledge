import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => document.fonts.ready)
})

test('shows the top bar on the Vanta background', async ({ page }) => {
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'All trees' })).toBeVisible()
  await expect(page.getByText('Yeraz', { exact: true })).toBeVisible()

  const colours = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement)
    return {
      body: getComputedStyle(document.body).backgroundColor,
      bg: css.getPropertyValue('--bg').trim(),
      top: getComputedStyle(document.querySelector('header')!).backgroundColor,
    }
  })
  expect(colours.bg.toUpperCase()).toBe('#030303')
  expect(colours.body).toBe('rgb(3, 3, 3)')
  expect(colours.top).toBe('rgb(5, 6, 6)')
})

test('applies the default theme with four attributes on <html>', async ({ page }) => {
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-base', 'vanta')
  await expect(html).toHaveAttribute('data-mode', 'dark')
  await expect(html).toHaveAttribute('data-accent', 'green')
  await expect(html).toHaveAttribute('data-font', 'geist')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#050606')
})

test('switches theme through the data attributes alone', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.documentElement
    Object.assign(root.dataset, { base: 'paper', mode: 'light', accent: 'violet' })
  })
  const result = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    darkMark: getComputedStyle(document.querySelectorAll('header img')[0]!).display,
    lightMark: getComputedStyle(document.querySelectorAll('header img')[1]!).display,
  }))
  expect(result.body).toBe('rgb(243, 241, 235)')
  expect(result.accent.toUpperCase()).toBe('#6743C4')
  expect(result.darkMark).toBe('none')
  expect(result.lightMark).toBe('block')
})

test('loads the Geist interface font', async ({ page }) => {
  expect(await page.evaluate(() => document.fonts.check('500 14px "Geist Variable"'))).toBe(true)
})

test('has no accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

const AUTH = { Authorization: 'Bearer fake-token' }

test('reaches the fake GitHub over HTTP, with CORS', async ({ page, fake, api }) => {
  const result = await page.evaluate(
    async ({ api, headers }) => {
      const res = await fetch(`${api}/repos/you/engineering/git/trees/main?recursive=1`, {
        headers,
        cache: 'no-store',
      })
      const body = (await res.json()) as { tree: { path: string }[] }
      return {
        leaves: body.tree.filter((e) => e.path.endsWith('.md')).length,
        etag: res.headers.get('etag'),
      }
    },
    { api, headers: AUTH },
  )
  expect(result.leaves).toBe(300)
  expect(result.etag).toMatch(/^W\//)
  expect(fake.log.map((e) => e.status)).toEqual([200])
})

test('passes a 304 through to the app, in every engine', async ({ page, fake, api }) => {
  const status = await page.evaluate(
    async ({ api, headers }) => {
      const url = `${api}/repos/you/engineering/git/trees/main?recursive=1`
      const first = await fetch(url, { headers, cache: 'no-store' })
      const etag = first.headers.get('etag')!
      const second = await fetch(url, {
        headers: { ...headers, 'If-None-Match': etag },
        cache: 'no-store',
      })
      return second.status
    },
    { api, headers: AUTH },
  )
  expect(status).toBe(304)
  expect(fake.log.map((e) => e.status)).toEqual([200, 304])
})

test('fails like a real network error when the fake is offline', async ({ page, fake, api }) => {
  fake.faults.offline = true
  const error = await page.evaluate(
    async ({ api, headers }) =>
      fetch(`${api}/graphql`, { method: 'POST', headers, body: '{}' }).then(
        () => null,
        (e: unknown) => (e instanceof TypeError ? 'TypeError' : String(e)),
      ),
    { api, headers: AUTH },
  )
  expect(error).toBe('TypeError')
})

test('points the app at the fake only in end-to-end builds', async ({ page, api }) => {
  expect(await page.evaluate(() => window.__YERAZ_API__)).toBe(api)
})
