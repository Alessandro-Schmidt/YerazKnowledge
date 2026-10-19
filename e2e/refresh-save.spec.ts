// Issue #63: Refresh and Save in the top bar, on phones too. Save commits pending edits now
// (as Ctrl/Cmd+S does); Refresh brings in what other devices committed.

import { treesOf } from '../src/map/family'
import { expect, isPhone, signIn, signInHere, test } from './fixtures'

const REPO = 'you/engineering'

test('Refresh and Save are on screen, on every device', async ({ page }) => {
  await signIn(page)
  const width = page.viewportSize()!.width
  const onScreen = async (name: string) => {
    const box = (await page.getByRole('button', { name }).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
  await onScreen('Refresh')
  // Nothing to save yet: a phone, short of room, hides Save until there is.
  const save = page.getByRole('button', { name: 'Save now' })
  if (isPhone(page)) await expect(save).toBeHidden()
  else await expect(save).toBeDisabled()

  await page.locator('header').getByRole('button', { name: 'New leaf' }).click()
  await page.getByRole('dialog').getByRole('textbox').first().fill('Written by hand')
  await page.getByRole('dialog').getByRole('button', { name: 'Create leaf' }).click()
  await expect(save).toBeEnabled()
  await onScreen('Save now')
})

test('Refresh shows a leaf another device committed', async ({ page, fake, graph }) => {
  await signIn(page)
  const branch = treesOf(graph).find((id) => graph.nodes.get(id)!.kind === 'branch')!
  const id = `${branch}/from-elsewhere.md`
  await fake.repo(REPO).commit({
    message: 'From another device',
    additions: [{ path: id, contents: '# From elsewhere\n\nWritten on a phone.\n' }],
  })
  const node = page.locator(`[data-node][data-id="${id}"]`)
  await expect(node).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(node).toHaveCount(1)
})

test('Save commits pending edits at once, without waiting two minutes', async ({
  page,
  fake,
  graph,
}) => {
  test.skip(isPhone(page), 'Typing tests run on desktop engines')
  await page.clock.install()
  const leaf = [...graph.nodes.values()].find((n) => n.kind === 'leaf' && !n.children.length)!
  await page.goto(`./#/tree/${REPO}/${leaf.id}`)
  await signInHere(page)
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\nSaved by hand.')
  await expect(page.getByRole('status')).toContainText('Unsaved edits')
  fake.resetLog()

  await page.getByRole('button', { name: 'Save now' }).click()
  await expect.poll(() => fake.log.filter((e) => e.operation === 'mutation').length).toBe(1)
  await expect(page.getByRole('status')).toContainText('Synced')
  expect(fake.repo(REPO).read(leaf.id)).toContain('Saved by hand.')
  await expect(page.getByRole('button', { name: 'Save now' })).toBeDisabled()
})
