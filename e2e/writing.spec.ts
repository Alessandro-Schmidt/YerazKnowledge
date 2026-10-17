// M2's exit tests (development-plan.md §6): autosave timing, commit on hide, offline edits,
// two devices, and moves that rewrite backlinks. Time is Playwright's clock, never a sleep.

import type { Browser, Page } from '@playwright/test'
import type { FakeGitHub } from '../test/fake-github/fakeGitHub'
import type { Graph } from '../src/model/graph'
import { expect, isPhone, signInHere, test, TOKEN } from './fixtures'

const REPO = 'you/engineering'

/** A leaf linked from elsewhere, with sub-leaves: moving it exercises backlink rewriting. */
function linkedLeaf(graph: Graph) {
  return [...graph.nodes.values()]
    .filter(
      (n) => n.kind === 'leaf' && (graph.in.get(n.id)?.length ?? 0) >= 2 && n.children.length > 0,
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0]!
}

const plainLeaf = (graph: Graph) =>
  [...graph.nodes.values()]
    .filter((n) => n.kind === 'leaf' && n.children.length === 0)
    .sort((a, b) => a.id.localeCompare(b.id))[0]!

const mutations = (fake: FakeGitHub) => fake.log.filter((e) => e.operation === 'mutation')

async function openEditor(page: Page, path: string) {
  await page.goto(`./#/tree/${REPO}/${path}`)
  await signInHere(page).catch(() => undefined)
  await expect(page.locator('.cm-content')).toBeVisible()
}

/** Types at the end of the leaf, then waits for the edit to reach this device's storage. */
async function typeAtEnd(page: Page, text: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
  await expect(page.getByRole('status')).toContainText('Unsaved edits')
}

test.describe('autosave', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')

  test('no commit before two minutes; at two minutes one commit with only the changed file', async ({
    page,
    fake,
    graph,
  }) => {
    await page.clock.install()
    const leaf = plainLeaf(graph)
    await openEditor(page, leaf.id)
    const before = new Map(fake.repo(REPO).head!.files)
    fake.resetLog()
    await typeAtEnd(page, '\nWritten in the editor.')

    await page.clock.fastForward('01:50')
    expect(mutations(fake)).toHaveLength(0)
    await page.clock.fastForward('00:15')
    await expect.poll(() => mutations(fake).length).toBe(1)

    const after = fake.repo(REPO).head!.files
    const changed = [...after]
      .filter(([path, sha]) => before.get(path) !== sha)
      .map(([path]) => path)
    expect(changed).toEqual([leaf.id])
    expect(fake.repo(REPO).read(leaf.id)).toContain('Written in the editor.')
    await expect(page.getByRole('status')).toHaveText('Synced to main')
  })

  test('hiding the page commits at once', async ({ page, fake, graph }) => {
    await openEditor(page, plainLeaf(graph).id)
    fake.resetLog()
    await typeAtEnd(page, ' Hidden.')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => mutations(fake).length).toBe(1)
    expect(fake.repo(REPO).read(plainLeaf(graph).id)).toContain('Hidden.')
  })

  test('Ctrl/Cmd+S commits at once, and so does leaving the leaf', async ({
    page,
    fake,
    graph,
  }) => {
    await openEditor(page, plainLeaf(graph).id)
    fake.resetLog()
    await typeAtEnd(page, ' Saved by shortcut.')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => mutations(fake).length).toBe(1)

    await typeAtEnd(page, ' Saved by leaving.')
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect.poll(() => mutations(fake).length).toBe(2)
    expect(fake.repo(REPO).read(plainLeaf(graph).id)).toContain('Saved by leaving.')
  })

  test('an edit made offline survives a reload and is committed when the connection returns', async ({
    page,
    fake,
    graph,
  }) => {
    const leaf = plainLeaf(graph)
    await openEditor(page, leaf.id)
    fake.faults.offline = true
    await typeAtEnd(page, ' Offline words.')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByRole('status')).toHaveText('Offline · edits kept on this device')

    await page.reload()
    await expect(page.locator('.cm-content')).toContainText('Offline words.')
    expect(fake.repo(REPO).read(leaf.id)).not.toContain('Offline words.')

    fake.faults.offline = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => fake.repo(REPO).read(leaf.id)).toContain('Offline words.')
    await expect(page.getByRole('status')).toHaveText('Synced to main')
  })
})

/** A second device: its own browser context, signed in to the same fake GitHub. */
async function secondDevice(browser: Browser, api: string, baseURL: string) {
  const context = await browser.newContext({ baseURL })
  await context.addInitScript((url) => {
    window.__YERAZ_API__ = url
  }, api)
  const page = await context.newPage()
  return { context, page }
}

test.describe('two devices', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')

  for (const same of [false, true]) {
    test(
      same
        ? 'edits to the same lines keep both versions, with a banner'
        : 'edits to different lines merge cleanly',
      async ({ page, browser, api, fake, graph, baseURL }) => {
        const leaf = plainLeaf(graph)
        const original = fake.repo(REPO).read(leaf.id)!
        const laptop = page
        const phone = (await secondDevice(browser, api, baseURL!)).page
        await openEditor(laptop, leaf.id)
        await phone.goto(`./#/tree/${REPO}/${leaf.id}`)
        await phone.getByLabel('Personal access token').fill(TOKEN)
        await phone.getByRole('button', { name: 'Continue' }).click()
        await expect(phone.locator('.cm-content')).toBeVisible()

        // The phone edits the title line; the laptop edits the end, or the same title line.
        await phone.locator('.cm-content .cm-line').first().click()
        await phone.keyboard.press('End')
        await phone.keyboard.type(' (phone)')
        await expect(phone.getByRole('status')).toContainText('Unsaved edits')
        await phone.keyboard.press('ControlOrMeta+s')
        await expect.poll(() => fake.repo(REPO).read(leaf.id)).toContain('(phone)')

        if (same) {
          await laptop.locator('.cm-content .cm-line').first().click()
          await laptop.keyboard.press('End')
          await laptop.keyboard.type(' (laptop)')
          await expect(laptop.getByRole('status')).toContainText('Unsaved edits')
        } else {
          await typeAtEnd(laptop, '\nFrom the laptop.')
        }
        await laptop.keyboard.press('ControlOrMeta+s')

        if (!same) {
          await expect.poll(() => fake.repo(REPO).read(leaf.id)).toContain('From the laptop.')
          const merged = fake.repo(REPO).read(leaf.id)!
          expect(merged).toContain('(phone)')
          expect(merged.split('\n').length).toBe(original.split('\n').length + 1)
        } else {
          await expect(laptop.getByRole('alert')).toContainText(
            'Another device changed the same lines',
          )
          const copies = [...fake.repo(REPO).head!.files.keys()].filter((p) =>
            /\.conflict-\d{4}-\d{2}-\d{2}\.md$/.test(p),
          )
          expect(copies).toHaveLength(1)
          expect(fake.repo(REPO).read(leaf.id)).toContain('(phone)')
          expect(fake.repo(REPO).read(leaf.id)).not.toContain('(laptop)')
          expect(fake.repo(REPO).read(copies[0]!)).toContain('(laptop)')
        }
      },
    )
  }
})

test('moving a leaf rewrites every backlink in one commit', async ({ page, fake, graph }) => {
  test.skip(isPhone(page), 'The move dialog is the same on phones; one run is enough')
  const leaf = linkedLeaf(graph)
  const linking = graph.in.get(leaf.id)!
  await page.goto(`./#/tree/${REPO}/${leaf.id}`)
  await signInHere(page)
  const panel = page.getByRole('region', { name: 'Leaf preview' })
  await panel.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Move…' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'At the top of the Tree' }).check()
  fake.resetLog()
  await dialog.getByRole('button', { name: 'Move' }).click()
  const moved = leaf.id.replace(/^.*\//, '')
  await expect(page).toHaveURL(new RegExp(`#/tree/${REPO}/${moved.replace('.', '\\.')}$`))
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => mutations(fake).length).toBe(1)

  const repo = fake.repo(REPO)
  expect(repo.read(leaf.id)).toBeUndefined()
  expect(repo.read(moved)).toBeDefined()
  for (const path of linking) {
    expect(repo.read(path), path).toContain(`(/${moved}`)
    expect(repo.read(path), path).not.toContain(`(/${leaf.id}`)
  }
  for (const child of graph.nodes.get(leaf.id)!.children) {
    expect(repo.read(child)).toBeUndefined()
  }
})

test('creates a leaf from the Explorer and opens it, ready to write', async ({ page, fake }) => {
  test.skip(isPhone(page), 'The Explorer is a drawer on phones')
  await page.goto(`./#/tree/${REPO}`)
  await signInHere(page)
  await page
    .getByRole('complementary', { name: 'Explorer' })
    .getByRole('button', { name: 'New leaf' })
    .click()
  await page.getByRole('dialog').getByLabel('Title').fill('Fresh Ideas')
  await page.getByRole('dialog').getByRole('button', { name: 'Create leaf' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering\/fresh-ideas\.md$/)
  await expect(page.locator('.cm-title')).toContainText('Fresh Ideas')
  await page.keyboard.type('First line of a new leaf.')
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect
    .poll(() => fake.repo(REPO).read('fresh-ideas.md'))
    .toContain('First line of a new leaf.')
  await expect(page.locator('[data-node][data-id="fresh-ideas.md"]').first()).toBeAttached()
})

test('a leaf is edited where it is shown: over the map, and at an old editor link', async ({
  page,
  fake,
  graph,
}) => {
  const leaf = plainLeaf(graph)
  await page.goto(`./#/edit/${REPO}/${leaf.id}`)
  await signInHere(page)
  await expect(page).toHaveURL(new RegExp(`#/tree/${REPO}/${leaf.id.replace('.', '\\.')}$`))
  const panel = page.getByRole('region', { name: 'Leaf preview' })
  await expect(panel.getByRole('textbox', { name: 'Leaf text' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Edit leaf' })).toHaveCount(0)
  if (!isPhone(page)) await expect(page.locator('[data-map]')).toBeVisible()
  await typeAtEnd(page, ' Typed beside the map.')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(leaf.id)).toContain('Typed beside the map.')
})

test('creates a new Tree from Home', async ({ page, fake }) => {
  await page.goto('./')
  await signInHere(page)
  await page.getByRole('button', { name: 'Create a new repository' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Reading Notes')
  await expect(page.getByRole('dialog').getByLabel('Repository')).toHaveValue('reading-notes')
  await page.getByRole('dialog').getByRole('button', { name: 'Create Tree' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/reading-notes$/)
  await expect(page.getByRole('heading', { name: 'Reading Notes', level: 1 })).toBeVisible()
  await expect(page.locator('[data-node][data-id="welcome.md"]').first()).toBeAttached()
  expect(fake.repo('you/reading-notes').isPrivate).toBe(true)
})

test('creates a branch with its first leaf, keeping the name as typed', async ({ page, fake }) => {
  test.skip(isPhone(page), 'The Explorer is a drawer on phones')
  await page.goto(`./#/tree/${REPO}`)
  await signInHere(page)
  await page
    .getByRole('complementary', { name: 'Explorer' })
    .getByRole('button', { name: 'New branch' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Branch name').fill('Distributed Systems')
  await dialog.getByLabel('First leaf').fill('Consensus')
  await dialog.getByRole('button', { name: 'Create branch' }).click()
  await expect(page).toHaveURL(/#\/tree\/you\/engineering\/Distributed%20Systems\/consensus\.md$/)
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => fake.repo(REPO).read('Distributed Systems/consensus.md'))
    .toBe('# Consensus\n\n')
})

test('deleting a leaf warns about the leaves that link to it', async ({ page, fake, graph }) => {
  const leaf = linkedLeaf(graph)
  // The leaf goes with its sub-leaves; the warning counts links to any of them from outside.
  const gone = new Set([leaf.id, ...graph.nodes.get(leaf.id)!.children])
  const linkers = new Set(
    [...gone].flatMap((p) => graph.in.get(p) ?? []).filter((p) => !gone.has(p)),
  )
  await page.goto(`./#/tree/${REPO}/${leaf.id}`)
  await signInHere(page)
  await page
    .getByRole('region', { name: 'Leaf preview' })
    .getByRole('button', { name: 'More actions' })
    .click()
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(`${linkers.size} leaves link here`)
  const count = 1 + graph.nodes.get(leaf.id)!.children.length
  await dialog
    .getByRole('button', { name: count > 1 ? `Delete ${count} leaves` : 'Delete leaf' })
    .click()
  await expect(page).toHaveURL(new RegExp(`#/tree/${REPO}$`))
  await expect(page.locator(`[data-node][data-id="${leaf.id}"]`)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fake.repo(REPO).read(leaf.id)).toBeUndefined()
})

test('live preview hides Markdown away from the cursor, toggles tasks, and shows the source on request', async ({
  page,
}) => {
  test.skip(isPhone(page), 'Typing tests run on desktop engines')
  await page.goto(`./#/tree/${REPO}`)
  await signInHere(page)
  await page.getByRole('button', { name: 'New leaf' }).first().click()
  await page.getByRole('dialog').getByLabel('Title').fill('Preview check')
  await page.getByRole('dialog').getByRole('button', { name: 'Create leaf' }).click()
  await expect(page.locator('.cm-title')).toBeVisible()
  await page.keyboard.type('## Section\n- [ ] A task\n\nLast line')

  // Away from the cursor, "##" and "[ ]" are not shown; the task is a checkbox.
  await expect(page.locator('.cm-h2')).toHaveText('Section')
  const box = page.locator('input.cm-task')
  await expect(box).not.toBeChecked()
  await box.click()
  await expect(page.locator('input.cm-task')).toBeChecked()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Show Markdown' }).click()
  await expect(page.locator('.cm-content')).toContainText('## Section')
  await expect(page.locator('.cm-content')).toContainText('- [x] A task')
  await expect(page.locator('input.cm-task')).toHaveCount(0)
})

test('the editor and the dialogs have no accessibility violations', async ({ page, graph }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  await openEditor(page, plainLeaf(graph).id)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.goto(`./#/tree/${REPO}/${linkedLeaf(graph).id}`)
  await page
    .getByRole('region', { name: 'Leaf preview' })
    .getByRole('button', { name: 'More actions' })
    .click()
  await page.getByRole('menuitem', { name: 'Move…' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
