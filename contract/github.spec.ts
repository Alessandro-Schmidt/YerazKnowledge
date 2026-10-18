// Against real GitHub (development-plan.md §7.5): connect, read, edit, autosave (Ctrl/Cmd+S),
// check the commit through the API, then reset the leaf. The repository needs a
// .yeraz.json; the test makes its leaf, contract.md, if it isn't there yet.

import { expect, test, type APIRequestContext } from '@playwright/test'

const TOKEN = process.env.YERAZ_CONTRACT_TOKEN
const REPO = process.env.YERAZ_CONTRACT_REPO ?? ''
const LEAF = 'contract.md'
const BASE = '# Contract\n\nWritten by the nightly contract test.\n'

test.skip(!TOKEN || !REPO, 'Set YERAZ_CONTRACT_TOKEN and YERAZ_CONTRACT_REPO to run it')

const api = (
  request: APIRequestContext,
  path: string,
  init: { method?: string; data?: unknown } = {},
) =>
  request.fetch(`https://api.github.com${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(init.data === undefined ? {} : { data: init.data }),
  })

async function readLeaf(request: APIRequestContext) {
  const res = await api(request, `/repos/${REPO}/contents/${LEAF}`)
  if (res.status() === 404) return null
  const body = (await res.json()) as { content: string; sha: string }
  return { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: body.sha }
}

async function writeLeaf(request: APIRequestContext, text: string, message: string) {
  const current = await readLeaf(request)
  const res = await api(request, `/repos/${REPO}/contents/${LEAF}`, {
    method: 'PUT',
    data: { message, content: Buffer.from(text).toString('base64'), sha: current?.sha },
  })
  expect(res.ok(), await res.text()).toBe(true)
}

test('read, edit, autosave and verify against real GitHub', async ({ page, request }) => {
  if ((await readLeaf(request))?.text !== BASE)
    await writeLeaf(request, BASE, 'Reset the contract leaf')

  await page.goto('./')
  await page.getByLabel('Personal access token').fill(TOKEN!)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'All trees', level: 1 }).waitFor()

  const stamp = `Contract run ${new Date().toISOString()}`
  try {
    await page.goto(`./#/edit/${REPO}/${LEAF}`)
    const editor = page.locator('.cm-content')
    await expect(editor).toContainText('Written by the nightly contract test.', { timeout: 30_000 })
    await editor.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(`\n${stamp}\n`)
    await expect(page.getByRole('status')).toContainText('Unsaved edits')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByRole('status')).toHaveText(/^Synced to /, { timeout: 30_000 })

    // The commit is on GitHub, made by createCommitOnBranch, with only this leaf.
    await expect
      .poll(async () => (await readLeaf(request))?.text, { timeout: 30_000 })
      .toContain(stamp)
    const commits = await (
      await api(request, `/repos/${REPO}/commits?path=${LEAF}&per_page=1`)
    ).json()
    expect(commits[0].commit.message).toBe('Update Contract')

    // Reopening makes the conditional request and shows the committed text.
    await page.goto(`./#/tree/${REPO}/${LEAF}`)
    await expect(page.getByRole('region', { name: 'Leaf preview' })).toContainText(stamp)
  } finally {
    await writeLeaf(request, BASE, 'Reset the contract leaf')
  }
})

// Growth rings dates leaves with blame (src/github/graphql.ts, fetchPlanted): the shape the
// fake answers with must be GitHub's, and a missing file must fail only its own field.
test('blame answers as the fake does', async ({ request }) => {
  if (!(await readLeaf(request))) await writeLeaf(request, BASE, 'Reset the contract leaf')
  const [owner, name] = REPO.split('/')
  const res = await api(request, '/graphql', {
    method: 'POST',
    data: {
      query: `query Planted($owner: String!, $name: String!, $rev: String!) { repository(owner: $owner, name: $name) { object(expression: $rev) { ... on Commit {
        b0: blame(path: "${LEAF}") { ranges { commit { committedDate } } }
        b1: blame(path: "no-such-file.md") { ranges { commit { committedDate } } } } } } }`,
      variables: { owner, name, rev: 'HEAD' },
    },
  })
  const body = (await res.json()) as {
    data: {
      repository: {
        object: Record<string, { ranges: { commit: { committedDate: string } }[] } | null>
      }
    }
    errors?: { path: string[] }[]
  }
  const ranges = body.data.repository.object.b0!.ranges
  expect(ranges.length).toBeGreaterThan(0)
  expect(Date.parse(ranges[0]!.commit.committedDate)).not.toBeNaN()
  expect(body.data.repository.object.b1).toBeNull()
  expect(body.errors?.[0]?.path).toContain('b1')
})
