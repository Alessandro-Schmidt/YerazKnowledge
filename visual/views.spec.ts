import type { Page } from '@playwright/test'
import { expect, signInHere, test as base } from '../e2e/fixtures'
import { createFakeGitHub } from '../test/fake-github/fakeGitHub'
import { designTrees } from '../test/fake-github/designFixture'
import { VIEW_IDS } from '../src/views/views'

// Every view (design/views/screens/01–17) with the design's Trees and Keycloak selected, written
// to visual-review/ for the owner to compare with design/views/screens/.
const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  fake: async ({}, use) => {
    const fake = createFakeGitHub({ login: 'you', tokens: ['fake-token'] })
    for (const tree of designTrees().reverse()) {
      if (!tree.repo.endsWith('/engineering')) {
        await fake.addRepo(tree.repo, tree.files)
        continue
      }
      // Engineering is planted over a year, so Growth rings has one ring per month.
      const leaves = Object.keys(tree.files).filter((p) => p.endsWith('.md') && p !== 'README.md')
      const rest = Object.fromEntries(
        Object.entries(tree.files).filter(([p]) => !leaves.includes(p)),
      )
      const repo = await fake.addRepo(tree.repo, rest)
      for (let m = 0; m < 12; m++) {
        const additions = leaves
          .filter((_, i) => (i * 7) % 12 === m)
          .map((path) => ({ path, contents: tree.files[path]! }))
        if (additions.length)
          await repo.commit({
            message: `Month ${m}`,
            date: new Date(Date.UTC(2025, 10 + m, 5)),
            additions,
          })
      }
    }
    await use(fake)
  },
})

const KEYCLOAK = 'Identity/keycloak.md'

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(900)
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `visual-review/${name}.png` })
}

for (const view of VIEW_IDS.filter((v) => v !== 'map')) {
  test(`view ${view}`, async ({ page, isMobile }) => {
    await page.addInitScript((v) => localStorage.setItem('yeraz-view', v), view)
    await page.goto('./')
    await signInHere(page)
    await page.goto(`./#/tree/you/engineering/${KEYCLOAK}`)
    await expect(page.getByRole('status')).toHaveText('Synced to main')
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
    await shot(page, `views-${view}-${isMobile ? 'phone' : 'desktop'}`)
  })
}

for (const page of ['views', 'colours'] as const) {
  test(`settings ${page}`, async ({ page: p, isMobile }) => {
    await p.goto('./')
    await signInHere(p)
    await p.goto(`./#/settings/${page}`)
    if (page === 'colours')
      await expect(p.getByRole('radiogroup', { name: 'Identity colour' })).toBeVisible()
    await shot(p, `settings-${page}-${isMobile ? 'phone' : 'desktop'}`)
  })
}
