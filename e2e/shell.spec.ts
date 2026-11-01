import AxeBuilder from '@axe-core/playwright'
import { expect, signIn, test, TOKEN, TOKEN2 } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => document.fonts.ready)
})

test('starts on the welcome screen: the logo, the name, GitHub or a folder', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toBeVisible()
  await expect(page.locator('main img').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'GitHub', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Folder', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connect GitHub' })).toHaveCount(0)
})

test('starts on the Vanta background', async ({ page }) => {
  await expect(page.locator('header img').first()).toBeVisible()
  const colours = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    top: getComputedStyle(document.querySelector('header')!).backgroundColor,
  }))
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
    Object.assign(document.documentElement.dataset, {
      base: 'paper',
      mode: 'light',
      accent: 'violet',
    })
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
  // `fonts.ready` can settle before the screen first asks for this weight: ask for it, then
  // check it is there (a missing or broken font loads no face).
  const faces = await page.evaluate(async () => {
    const loaded = await document.fonts.load('500 14px "Geist Variable"')
    return { loaded: loaded.length, check: document.fonts.check('500 14px "Geist Variable"') }
  })
  expect(faces).toEqual({ loaded: 1, check: true })
})

test('the welcome and token screens have no accessibility violations', async ({ page }) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('goes back from either choice to the welcome screen', async ({ page }) => {
  for (const choice of ['GitHub', 'Folder']) {
    await page.getByRole('button', { name: choice, exact: true }).click()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toBeVisible()
  }
})

test('the Yeraz logo returns to the introduction', async ({ page }) => {
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  await page.getByRole('link', { name: 'Yeraz', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByRole('link', { name: 'Yeraz', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Yeraz', level: 1 })).toBeVisible()
})

test('a project needs a name a folder can have', async ({ page }) => {
  await page.getByRole('button', { name: 'Folder', exact: true }).click()
  await page.getByLabel('Name').fill('a/b')
  await page.getByRole('button', { name: /Choose where to create it…|Create project/ }).click()
  await expect(page.getByRole('alert')).toContainText("can't contain")
})

test('refuses a token GitHub rejects, and says why', async ({ page }) => {
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  await page.getByLabel('Personal access token').fill('wrong')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toContainText("GitHub didn't accept this token")
  await expect(page.getByRole('heading', { name: 'Connect GitHub' })).toBeVisible()
})

test('signing in with the tab left on an introduction address opens the notes', async ({
  page,
}) => {
  await page.goto('./#/welcome/github')
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  await page.getByLabel('Personal access token').fill(TOKEN)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('[data-map]').waitFor()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering/)
})

test('changes the token from the repositories step and the introduction', async ({ page }) => {
  await signIn(page)
  await page.goto('./#/welcome/github')
  await expect(page.getByRole('heading', { name: 'Your GitHub repositories' })).toBeVisible()
  await page.getByRole('button', { name: 'Change token' }).click()
  await expect(page).toHaveURL(/#\/welcome\/token$/)
  await expect(page.getByRole('heading', { name: 'Change your GitHub token' })).toBeVisible()

  // One GitHub refuses leaves the old one in place: the session goes on.
  await page.getByLabel('Personal access token').fill('wrong')
  await page.getByRole('button', { name: 'Use this token' }).click()
  await expect(page.getByRole('alert')).toContainText("GitHub didn't accept this token")
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Your GitHub repositories' })).toBeVisible()

  // From the introduction too; one GitHub accepts replaces it, and the notes are still there.
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Change token' }).click()
  await page.getByLabel('Personal access token').fill(TOKEN2)
  await page.getByRole('button', { name: 'Use this token' }).click()
  // Back on the notes, as after connecting GitHub; and still signed in after a reload.
  await page.locator('[data-map]').waitFor()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Engineering')
  await page.reload()
  await page.locator('[data-map]').waitFor()
})

const AUTH = { Authorization: 'Bearer fake-token' }

test('passes a 304 through to the app, in every engine', async ({ page, fake, api }) => {
  const status = await page.evaluate(
    async ({ api, headers }) => {
      const url = `${api}/repos/you/engineering/git/trees/main?recursive=1`
      const first = await fetch(url, { headers, cache: 'no-store' })
      const second = await fetch(url, {
        headers: { ...headers, 'If-None-Match': first.headers.get('etag')! },
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

test('inside another page’s frame it shows only a link to open it in its own tab', async ({
  page,
}) => {
  // A page that frames the app, served by the test itself (any site could write one).
  const app = page.url()
  const framer = new URL('framer.html', app).href
  await page.route(framer, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<iframe src="${app}" width="600" height="400"></iframe>`,
    }),
  )
  await page.goto(framer)
  const inner = page.frameLocator('iframe')
  await expect(inner.getByRole('link', { name: 'Open Yeraz in its own tab' })).toBeVisible()
  await expect(inner.getByRole('button')).toHaveCount(0)
})
