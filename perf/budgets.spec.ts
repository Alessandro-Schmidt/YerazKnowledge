// The budgets of ARCHITECTURE.md §11, each scenario on the 1,000 and 5,000-leaf fixtures
// (development-plan.md §7.4). Budgets are set for 1,000 leaves; at 5,000 the numbers are
// measured and reported only. A number may exceed its budget by up to 20 % before the test
// fails; every number is attached to the report, so trends stay visible in CI artifacts.

import type { Page } from '@playwright/test'
import type { Graph } from '../src/model/graph'
import { expect, signInHere, test } from '../e2e/fixtures'

const TOLERANCE = 1.2

/** Leaves drawn as dots: a leaf at the top of the Family is a Tree's core instead. */
const dots = (graph: Graph) =>
  [...graph.nodes.values()].filter((n) => n.kind === 'leaf' && n.parent !== '').length

// ARCHITECTURE.md §11. Only reopening has a separate phone budget. On phones, select and
// frame time are reported but don't fail (owner's decision, development-plan.md §11).
const BUDGETS = {
  laptop: {
    reopen: 800,
    structure: 1000,
    content: 5000,
    select: 50,
    frame: 1000 / 60,
    keystroke: 16,
  },
  phone: {
    reopen: 1500,
    structure: 1000,
    content: 5000,
    select: null,
    frame: null,
    keystroke: 16,
  },
}
type Budget = keyof typeof BUDGETS.laptop

async function throttle(page: Page) {
  const rate = (test.info().project.use as { cpuThrottling?: number }).cpuThrottling
  if (!rate) return
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
}

function report(name: string, ms: number, budget: number | null) {
  test.info().annotations.push({
    type: name,
    description: `${ms.toFixed(1)} ms${budget === null ? ' (reported only)' : ` (budget ${+budget.toFixed(1)} ms)`}`,
  })
  if (budget === null) return
  expect(ms, `${name}: ${ms.toFixed(1)} ms, budget ${+budget.toFixed(1)} ms`).toBeLessThanOrEqual(
    budget * TOLERANCE,
  )
}

/** The app's marks (window.__yerazPerf in test builds). */
const marks = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (window as unknown as { __yerazPerf: { marks(n: string): number[] } }).__yerazPerf.marks(n),
    name,
  )

const markTime = (page: Page, name: string, which: 'first' | 'last' = 'first') =>
  page
    .waitForFunction(
      ([n, w]) => {
        const all = (
          window as unknown as { __yerazPerf: { marks(n: string): number[] } }
        ).__yerazPerf.marks(n)
        return all.length ? (w === 'first' ? all[0]! : all.at(-1)!) : false
      },
      [name, which] as const,
      { timeout: 60_000 },
    )
    .then((h) => h.jsonValue() as Promise<number>)

for (const leaves of [1000, 5000]) {
  const size = `${leaves.toLocaleString('en-US')}-leaf`
  test.describe(`${size} Tree`, () => {
    test.use({ leaves })
    test.setTimeout(leaves > 1000 ? 180_000 : 60_000)
    const budget = (name: Budget) =>
      leaves === 1000 ? BUDGETS[test.info().project.name as keyof typeof BUDGETS][name] : null

    test(`first open of a ${size} Tree: structure, then all content`, async ({ page, graph }) => {
      await throttle(page)
      // Signing in on the Tree's own URL opens it straight away, with an empty cache.
      await page.goto('./#/tree/you/engineering')
      await signInHere(page)
      const start = await markTime(page, 'tree-open')
      const structure = await markTime(page, 'map-painted', 'first')
      await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(dots(graph))
      await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 120_000 })
      const content = await markTime(page, 'map-painted', 'last')
      report('structure', structure - start, budget('structure'))
      report('content', content - start, budget('content'))
    })

    test(`reopen a cached ${size} Tree: map painted`, async ({ page, graph }) => {
      await page.goto('./#/tree/you/engineering')
      await signInHere(page)
      await expect(page.locator('[data-node][data-kind="leaf"]')).toHaveCount(dots(graph))
      await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 120_000 })
      await throttle(page)
      await page.reload()
      const painted = await markTime(page, 'map-painted', 'last')
      report('reopen', painted, budget('reopen'))
    })

    test('select a leaf: highlight and Peek, then its editor', async ({ page, graph }) => {
      await page.goto('./#/tree/you/engineering')
      await signInHere(page)
      await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 120_000 })
      await throttle(page)
      const leaves = [...graph.nodes.values()].filter((n) => n.kind === 'leaf').slice(0, 5)
      const times: number[] = []
      const editable: number[] = []
      for (const leaf of leaves) {
        await page.evaluate(() => performance.clearMarks())
        await page
          .locator(`[data-node][data-id="${leaf.id}"] circle`)
          .first()
          .dispatchEvent('click')
        const painted = await markTime(page, 'peek-painted', 'last')
        const start = await markTime(page, 'select', 'last')
        times.push(painted - start)
        // The leaf is shown in its editor (#17): the text arrives just after the Peek.
        editable.push((await markTime(page, 'editor-painted', 'last')) - start)
      }
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[2]!
      report('select (median of 5)', median(times), budget('select'))
      report('select to editable leaf (median of 5)', median(editable), null)
    })

    test('pan and zoom: frame time over 3 s of wheel zooming', async ({ page }) => {
      await page.goto('./#/tree/you/engineering')
      await signInHere(page)
      await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 120_000 })
      await throttle(page)
      const box = (await page.locator('[data-map]').boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      // Two numbers per frame. Delivered: the time between frames, which on CI's runners
      // (no GPU) is mostly software rasterising the SVG, so it is reported only. Work: the
      // main thread's own time for the frame, from its start until after style, layout and
      // paint (a message posted from requestAnimationFrame runs once those are done). That is
      // what the app's code decides, and what the 60 fps budget holds it to.
      await page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __work: number[] }
        w.__frames = []
        w.__work = []
        const after = new MessageChannel()
        let start = 0
        after.port1.onmessage = () => w.__work.push(performance.now() - start)
        let last = performance.now()
        const tick = (t: number) => {
          w.__frames.push(t - last)
          last = t
          start = t
          after.port2.postMessage(0)
          if (w.__frames.length < 400) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const end = Date.now() + 3000
      for (let i = 0; Date.now() < end; i++) {
        await page.mouse.wheel(0, i % 40 < 20 ? -60 : 60)
        await page.waitForTimeout(16)
      }
      const { frames, work } = await page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __work: number[] }
        return { frames: w.__frames.slice(5), work: w.__work.slice(5) }
      })
      const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]!
      report('frame p95, delivered', p95(frames), null)
      report('frame p95, main-thread work', p95(work), budget('frame'))
    })
  })
}

test.describe('typing', () => {
  test('a keystroke in a 10,000-line leaf', async ({ page, fake }) => {
    // Written the way long notes are: sections, paragraphs and lists. (One 10,000-line
    // paragraph would be re-parsed whole on every keystroke: Markdown can't split it.)
    const lines = Array.from({ length: 10_000 }, (_, i) =>
      i % 40 === 0
        ? `## Section ${i / 40 + 1}`
        : i % 8 === 7
          ? ''
          : i % 40 > 30
            ? `- Item ${i} with *emphasis* and \`code\``
            : `Line ${i + 1}: an ordinary sentence, about as long as people write them.`,
    )
    await fake.repo('you/engineering').commit({
      message: 'A long leaf',
      additions: [{ path: 'long.md', contents: `# Long\n\n${lines.join('\n')}\n` }],
    })
    await page.goto('./#/tree/you/engineering/long.md')
    await signInHere(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await throttle(page)
    // Settle first: right after opening, CodeMirror is still parsing the long document in
    // the background and the code is cold, so the first keystrokes cost more.
    await page.keyboard.type('Warm up. ')
    await expect.poll(() => marks(page, 'keystroke-done')).toHaveLength(9)
    // Then until the page is idle: five idle periods in a row with nothing else to run.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let quiet = 0
          const check = (deadline: IdleDeadline) => {
            quiet = deadline.timeRemaining() > 40 ? quiet + 1 : 0
            if (quiet === 5) resolve()
            else requestIdleCallback(check)
          }
          requestIdleCallback(check)
        }),
    )
    await page.evaluate(() => performance.clearMarks())
    const text = 'typing at the end of a long leaf'
    for (const ch of text) {
      await page.keyboard.type(ch)
      await page.waitForTimeout(30)
    }
    await expect.poll(() => marks(page, 'keystroke-done')).toHaveLength(text.length)
    const down = await marks(page, 'keystroke')
    const done = await marks(page, 'keystroke-done')
    const times = done.map((t, i) => t - down[i]!).sort((a, b) => a - b)
    report(
      'keystroke (p95)',
      times[Math.floor(times.length * 0.95)]!,
      BUDGETS[test.info().project.name as keyof typeof BUDGETS].keystroke,
    )
  })
})
