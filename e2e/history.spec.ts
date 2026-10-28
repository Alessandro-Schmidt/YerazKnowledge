// A leaf's history (issue #31): past versions from git, compared with the current text,
// and a restore that is one new commit through the normal save path.

import { expect, signInHere, test } from './fixtures'

const REPO = 'you/engineering'

test('lists past versions, compares one with now, and restores it as a new commit', async ({
  page,
  fake,
  fixture,
  graph,
}) => {
  const leaf = [...graph.nodes.values()]
    .filter((n) => n.kind === 'leaf' && n.children.length === 0)
    .sort((a, b) => a.id.localeCompare(b.id))[0]!
  const original = fixture.files[leaf.id]!
  const repo = fake.repo(REPO)
  await repo.commit({
    message: 'Rewrite the leaf',
    additions: [{ path: leaf.id, contents: `# ${leaf.title}\n\nRewritten elsewhere.\n` }],
  })
  const commits = repo.commits.length

  await page.goto(`./#/tree/${REPO}/${leaf.id}`)
  await signInHere(page)
  const panel = page.getByRole('region', { name: 'Leaf preview' })
  await expect(panel.locator('.cm-content')).toContainText('Rewritten elsewhere.')
  await panel.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'History' }).click()

  const history = panel.getByRole('region', { name: 'History' })
  const versions = history.getByRole('listitem')
  await expect(versions).toHaveCount(2)
  await expect(versions.first()).toContainText('Rewrite the leaf')
  await versions.last().getByRole('button').click()

  // Changes from that version to now: its lines struck out, the new one added.
  const changes = page.getByLabel('Changes from this version to now')
  await expect(changes.locator('ins', { hasText: 'Rewritten elsewhere.' })).toBeVisible()
  await expect(changes.locator('del').first()).toBeVisible()
  await page.getByRole('button', { name: 'This version', exact: true }).click()
  await expect(page.getByLabel('Changes from this version to now')).toHaveCount(0)

  fake.resetLog()
  await page.getByRole('button', { name: 'Restore this version' }).click()
  await expect.poll(() => repo.read(leaf.id)).toBe(original)
  expect(repo.commits).toHaveLength(commits + 1)
  expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
  // Back in the editor, with the restored text.
  await expect(panel.locator('.cm-content')).not.toContainText('Rewritten elsewhere.')
  await expect(page.getByRole('status')).toHaveText('Synced to main')
})

test('the history has no accessibility violations', async ({ page, graph }) => {
  test.slow()
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const leaf = [...graph.nodes.values()].find((n) => n.kind === 'leaf')!
  await page.goto(`./#/tree/${REPO}/${leaf.id}`)
  await signInHere(page)
  const panel = page.getByRole('region', { name: 'Leaf preview' })
  await panel.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'History' }).click()
  await expect(panel.getByRole('region', { name: 'History' }).getByRole('listitem')).toHaveCount(1)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
