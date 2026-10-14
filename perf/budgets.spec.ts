// The budgets that M1 can measure (ARCHITECTURE.md §11). A number may exceed its budget by
// up to 20 % before the test fails (development-plan.md §7.4); every number is attached to
// the report, so trends stay visible in CI artifacts.

import type { Page } from '@playwright/test'
import { expect, signInHere, test } from '../e2e/fixtures'

const TOLERANCE = 1.2

// ARCHITECTURE.md §11. Only reopening has a separate phone budget; the rest apply to both.
const BUDGETS = {
  laptop: { reopen: 800, structure: 1000, content: 5000, select: 50, frame: 1000 / 60 },
  phone: { reopen: 1500, structure: 1000, content: 5000, select: 50, frame: 1000 / 60 },
}

test.use({ leaves: 1000 })

async function throttle(page: Page) {
  const rate = (test.info().project.use as { cpuThrottling?: number }).cpuThrottling
  if (!rate) return
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
}

const budgets = () => BUDGETS[test.info().project.name as keyof typeof BUDGETS]

function report(name: string, ms: number, budget: number) {
  test
    .info()
    .annotations.push({ type: name, description: `${ms.toFixed(1)} ms (budget ${budget} ms)` })
  expect(ms, `${name}: ${ms.toFixed(1)} ms, budget ${budget} ms`).toBeLessThanOrEqual(
    budget * TOLERANCE,
  )
}

const markTime = (page: Page, name: string, which: 'first' | 'last' = 'first') =>
  page
    .waitForFunction(
      ([n, w]) => {
        const marks = performance.getEntriesByName(`yeraz:${n}`)
        return marks.length ? (w === 'first' ? marks[0]! : marks.at(-1)!).startTime : false
      },
      [name, which] as const,
      { timeout: 30_000 },
    )
    .then((h) => h.jsonValue() as Promise<number>)

test('first open of a 1,000-leaf Tree: structure, then all content', async ({ page }) => {
  await throttle(page)
  // Signing in on the Tree's own URL opens it straight away, with an empty cache.
  await page.goto('./#/tree/you/engineering')
  await signInHere(page)
  const start = await markTime(page, 'tree-open')
  const structure = await markTime(page, 'map-painted', 'first')
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(1000)
  await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
  const content = await markTime(page, 'map-painted', 'last')
  report('structure', structure - start, budgets().structure)
  report('content', content - start, budgets().content)
})

test('reopen a cached 1,000-leaf Tree: map painted', async ({ page }) => {
  await page.goto('./#/tree/you/engineering')
  await signInHere(page)
  await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(1000)
  await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
  await throttle(page)
  await page.reload()
  const painted = await markTime(page, 'map-painted', 'last')
  report('reopen', painted, budgets().reopen)
})

test('select a leaf: highlight and Peek', async ({ page, graph }) => {
  await page.goto('./#/tree/you/engineering')
  await signInHere(page)
  await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
  await throttle(page)
  const leaves = [...graph.nodes.values()].filter((n) => n.kind === 'leaf').slice(0, 5)
  const times: number[] = []
  for (const leaf of leaves) {
    await page.evaluate(() => performance.clearMarks())
    await page.locator(`[data-node][data-id="${leaf.id}"] circle`).first().dispatchEvent('click')
    const painted = await markTime(page, 'peek-painted', 'last')
    const start = await markTime(page, 'select', 'last')
    times.push(painted - start)
  }
  times.sort((a, b) => a - b)
  report('select (median of 5)', times[2]!, budgets().select)
})

test('pan and zoom: frame time over 3 s of wheel zooming', async ({ page }) => {
  await page.goto('./#/tree/you/engineering')
  await signInHere(page)
  await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
  await throttle(page)
  const box = (await page.locator('[data-map]').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] }
    w.__frames = []
    let last = performance.now()
    const tick = (t: number) => {
      w.__frames.push(t - last)
      last = t
      if (w.__frames.length < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const end = Date.now() + 3000
  for (let i = 0; Date.now() < end; i++) {
    await page.mouse.wheel(0, i % 40 < 20 ? -60 : 60)
    await page.waitForTimeout(16)
  }
  const frames = (
    await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames)
  ).slice(5)
  frames.sort((a, b) => a - b)
  const p95 = frames[Math.floor(frames.length * 0.95)]!
  report('frame p95', p95, budgets().frame)
})
