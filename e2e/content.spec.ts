// M3's exit tests (development-plan.md §6): mentions, the insert menu, images and embeds.

import type { Page } from '@playwright/test'
import type { Graph } from '../src/model/graph'
import { expect, signInHere, test } from './fixtures'

const REPO = 'you/engineering'

const mutations = (fake: { log: { operation?: string }[] }) =>
  fake.log.filter((e) => e.operation === 'mutation')

/** Two leaves without sub-leaves, the first not yet linking to the second (a unique title). */
function pair(graph: Graph) {
  const all = [...graph.nodes.values()].filter((n) => n.kind === 'leaf')
  const leaves = all.filter((n) => n.children.length === 0).sort((a, b) => a.id.localeCompare(b.id))
  const from = leaves[0]!
  const to = leaves.find(
    (n) =>
      n.id !== from.id &&
      !(graph.out.get(from.id) ?? []).includes(n.id) &&
      all.filter((m) => m.title.startsWith(n.title.split(' ')[0]!)).length === 1,
  )!
  return { from, to }
}

test.describe('mentions', () => {
  test.skip(({ isMobile }) => isMobile, 'Typing tests run on desktop engines')
  // Opens the map twice and the editor once.
  test.setTimeout(60_000)

  test('picking a mention inserts a thread; after the save the map shows it', async ({
    page,
    fake,
    graph,
  }) => {
    const { from, to } = pair(graph)
    await page.goto(`./#/tree/${REPO}`)
    await signInHere(page)
    await expect(page.getByRole('status')).toHaveText('Synced to main', { timeout: 30_000 })
    const threads = await page.locator('[data-map] [data-thread]').count()

    await page.goto(`./#/tree/${REPO}/${from.id}`)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(`\nSee @${to.title.split(' ')[0]}`)
    await page.getByRole('option', { name: new RegExp(`^${to.title}`) }).click()
    await expect(page.locator('.cm-content')).toContainText(to.title)
    await expect(page.getByRole('status')).toContainText('Unsaved edits')

    fake.resetLog()
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => mutations(fake).length).toBe(1)
    expect(fake.repo(REPO).read(from.id)).toContain(`[${to.title}](/${to.id})`)

    // Outside the edited line the link is a chip; clicking it opens the leaf.
    await page.keyboard.press('ControlOrMeta+Home')
    const chip = page.locator(`.cm-mention[data-path="${to.id}"]`)
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page).toHaveURL(new RegExp(`#/tree/${REPO}/${to.id}$`))
    await expect(page.locator('[data-map] [data-thread]')).toHaveCount(threads + 1)
  })
})

test.describe('dragging text onto a chip', () => {
  test.skip(({ isMobile }) => isMobile, 'Dragging runs on desktop engines')

  test('moves it to the end of that leaf, as a paragraph, and out of this one', async ({
    page,
    fake,
  }) => {
    await fake.repo(REPO).commit({
      message: 'drag',
      additions: [
        {
          path: 'from.md',
          contents: '# From\n\nSee [Target](/target.md).\n\nMove me.\n\nStays.\n',
        },
        { path: 'target.md', contents: '# Target\n\nAlready here.\n' },
      ],
    })
    await page.goto(`./#/tree/${REPO}/from.md`)
    await signInHere(page)
    const editor = page.locator('.cm-content')
    await editor.getByText('Move me.').click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    // The drop, as the browser delivers one from a drag of the selection.
    await page.locator('.cm-mention[data-path="target.md"]').evaluate((chip) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', 'Move me.')
      chip.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))
    })
    await expect(editor).not.toContainText('Move me.')
    await expect(editor).toContainText('Stays.')
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read('target.md'))
      .toBe('# Target\n\nAlready here.\n\nMove me.\n')
    expect(fake.repo(REPO).read('from.md')).toBe('# From\n\nSee [Target](/target.md).\n\nStays.\n')
  })

  test('a block, dragged by its handle, moves above another, or onto a chip', async ({
    page,
    fake,
  }) => {
    await fake.repo(REPO).commit({
      message: 'drag',
      additions: [
        {
          path: 'from.md',
          contents: '# From\n\nSee [Target](/target.md).\n\nMove me.\n\nStays.\n',
        },
        { path: 'target.md', contents: '# Target\n\nAlready here.\n' },
      ],
    })
    await page.goto(`./#/tree/${REPO}/from.md`)
    await signInHere(page)
    const line = (text: string) => page.locator('.cm-line', { hasText: text })
    const grip = page.locator('.cm-block-grip')
    /** Drags the handle of the block at `what` to `to`'s top left, in steps, as a hand does. */
    const drag = async (what: string, to: ReturnType<Page['locator']>, dx = 40, dy = 2) => {
      await line(what).hover()
      const from = (await grip.boundingBox())!
      await page.mouse.move(from.x + 9, from.y + 12)
      await page.mouse.down()
      await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 })
      const at = (await to.boundingBox())!
      await page.mouse.move(at.x + dx, at.y + dy, { steps: 10 })
      await page.mouse.up()
    }

    // Dropped in the margin, level with the handles, not on the text.
    await drag('Stays.', line('See'), -12, 2)
    await expect.poll(() => page.locator('.cm-content').innerText()).toMatch(/Stays\.[\s\S]*See/)

    await drag('Move me.', page.locator('.cm-mention[data-path="target.md"]'), 10, 8)
    await expect(page.locator('.cm-content')).not.toContainText('Move me.')
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read('target.md'))
      .toBe('# Target\n\nAlready here.\n\nMove me.\n')
    expect(fake.repo(REPO).read('from.md')).toBe('# From\n\nStays.\n\nSee [Target](/target.md).\n')
  })
})

test.describe('insert menu', () => {
  test.skip(({ isMobile }) => isMobile, 'Ctrl/Cmd runs on desktop engines')

  test.beforeEach(async ({ page, graph }) => {
    await page.clock.install()
    const leaf = pair(graph).from
    await page.goto(`./#/tree/${REPO}/${leaf.id}`)
    await signInHere(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
  })

  test('holding Ctrl/Cmd for 0.9 s shows nothing; at 1.0 s the menu opens', async ({ page }) => {
    const menu = page.getByRole('menu', { name: 'Insert' })
    // Time moves only when the test says so: the map beside the editor makes real time uneven.
    await page.clock.pauseAt(Date.now() + 1000)
    await page.keyboard.down('Control')
    await page.clock.runFor(900)
    await expect(menu).toHaveCount(0)
    await page.clock.runFor(100)
    await expect(menu).toBeVisible()
    await page.keyboard.up('Control')
    await expect(page.getByRole('menuitem', { name: 'To-do list' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  })

  for (const key of ['c', 'v']) {
    test(`Ctrl+${key.toUpperCase()} never opens it`, async ({ page }) => {
      await page.keyboard.down('Control')
      await page.keyboard.press(key)
      await page.clock.runFor(5000)
      await page.keyboard.up('Control')
      await expect(page.getByRole('menu', { name: 'Insert' })).toHaveCount(0)
    })
  }

  test('a to-do list item, and a new leaf with a mention to it', async ({ page, fake, graph }) => {
    const hold = async () => {
      await page.keyboard.down('Control')
      await page.clock.runFor(1000)
      await page.keyboard.up('Control')
    }
    await page.keyboard.press('Enter')
    await hold()
    await page.getByRole('menuitem', { name: 'To-do list' }).click()
    await page.keyboard.type('Write the report')
    await expect(page.locator('.cm-content')).toContainText('Write the report')

    await page.keyboard.press('Enter')
    await hold()
    await page.getByRole('menuitem', { name: 'New leaf' }).click()
    await page.getByRole('dialog').getByLabel('Title').fill('Quarterly report')
    await page.getByRole('button', { name: 'Create leaf' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+s')
    // Enter continues the list; the new leaf is a sub-leaf of this one.
    const leaf = pair(graph).from.id
    const sub = `/${leaf.replace(/\.md$/, '')}/quarterly-report.md`
    await expect
      .poll(() => fake.repo(REPO).read(leaf))
      .toContain(`- [ ] Write the report\n- [ ] [Quarterly report](${sub})`)
    expect(fake.repo(REPO).read(sub.slice(1))).toMatch(/^# Quarterly report\n/)
  })

  test('a code block, written in and saved', async ({ page, fake, graph }) => {
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.down('Control')
    await page.clock.runFor(1000)
    await page.keyboard.up('Control')
    await page.getByRole('menuitem', { name: 'Code block' }).click()
    await page.keyboard.type('npm test')
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read(pair(graph).from.id))
      .toContain('\n```\nnpm test\n```')
  })
})

test.describe('images', () => {
  test.skip(({ isMobile }) => isMobile, 'Adding files runs on desktop engines')
  test.setTimeout(60_000)

  /** An image drawn in the page: a sharp-edged screenshot (PNG) or a photo-like JPEG. */
  const draw = (page: Page, kind: 'screenshot' | 'photo', width: number, height: number) =>
    page
      .evaluate(
        ([kind, width, height]) => {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const c = canvas.getContext('2d')!
          const sky = c.createLinearGradient(0, 0, width, height)
          sky.addColorStop(0, kind === 'photo' ? 'steelblue' : 'white')
          sky.addColorStop(1, kind === 'photo' ? 'darkorange' : 'white')
          c.fillStyle = sky
          c.fillRect(0, 0, width, height)
          c.fillStyle = 'black'
          c.font = '40px sans-serif'
          for (let y = 60; y < height; y += 80) c.fillText('Realm → client → token', 40, y)
          return canvas.toDataURL(kind === 'photo' ? 'image/jpeg' : 'image/png', 0.95)
        },
        [kind, width, height] as const,
      )
      .then((url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))

  /** Width and height of committed image bytes, decoded by the browser. */
  const size = (page: Page, bytes: Uint8Array) =>
    page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes]))
      return { width: bitmap.width, height: bitmap.height }
    }, Buffer.from(bytes).toString('base64'))

  async function addImage(page: Page, name: string, mimeType: string, buffer: Buffer) {
    await page.keyboard.down('Control')
    await page.clock.runFor(2000)
    await page.keyboard.up('Control')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Image from files' }).click()
    await (await chooser).setFiles({ name, mimeType, buffer })
  }

  test('a screenshot is committed byte for byte, a large photo at 4,096 px, both in one commit', async ({
    page,
    fake,
    graph,
  }) => {
    await page.clock.install()
    const leaf = pair(graph).from.id
    await page.goto(`./#/tree/${REPO}/${leaf}`)
    await signInHere(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')

    const screenshot = await draw(page, 'screenshot', 1200, 800)
    const photo = await draw(page, 'photo', 6000, 4000)
    await addImage(page, 'Realm diagram.png', 'image/png', screenshot)
    // Drawn at once, even on the cursor's line: its Markdown isn't shown.
    const content = page.locator('.cm-content')
    await expect(content.locator('.cm-image img[alt="Realm diagram"]')).toHaveCount(1)
    await addImage(page, 'Ararat.jpg', 'image/jpeg', photo)
    await expect(content.locator('.cm-image img[alt="Ararat"]')).toHaveCount(1, { timeout: 20_000 })
    await expect(page.getByRole('status')).toContainText('Unsaved edits')

    fake.resetLog()
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => mutations(fake).length).toBe(1)
    const repo = fake.repo(REPO)
    const files = [...repo.head!.files.keys()].filter((p) => p.startsWith('assets/'))
    const png = files.find((p) => p.endsWith('realm-diagram.png'))!
    // Where the canvas can't encode WebP (WebKit on macOS, not on Linux), the photo falls
    // back to JPEG (images.ts): ask the browser, as the app does.
    const webp = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          canvas.toBlob((b) => resolve(b?.type === 'image/webp'), 'image/webp')
        }),
    )
    const photoFile = files.find((p) => /ararat\.(webp|jpg)$/.test(p))!
    expect(photoFile).toMatch(webp ? /\.webp$/ : /\.jpg$/)
    expect(png).toMatch(/^assets\/\d{4}-\d{2}-\d{2}-realm-diagram\.png$/)
    expect(Buffer.from(repo.blobs.get(repo.head!.files.get(png)!)!)).toEqual(screenshot)
    const committed = repo.blobs.get(repo.head!.files.get(photoFile)!)!
    expect(await size(page, committed)).toEqual({ width: 4096, height: 2731 })
    expect(repo.read(leaf)).toContain(`![Realm diagram](/${png})`)
    expect(repo.read(leaf)).toContain(`![Ararat](/${photoFile})`)
  })
})

test.describe('resizing an image (issue #27)', () => {
  test.skip(({ isMobile }) => isMobile, 'Dragging runs on desktop engines')

  test('dragging a side inwards shrinks it, outwards grows it; the width is in its title', async ({
    page,
    fake,
    graph,
  }) => {
    await page.clock.install()
    const leaf = pair(graph).from.id
    const png = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1600
      canvas.height = 800
      canvas.getContext('2d')!.fillRect(0, 0, 1600, 800)
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
      return [...new Uint8Array(await blob.arrayBuffer())]
    })
    const repo = fake.repo(REPO)
    await repo.commit({
      message: 'image',
      additions: [
        { path: 'assets/realm.png', contents: new Uint8Array(png) },
        { path: leaf, contents: `${repo.read(leaf)}\n![Realm](/assets/realm.png)\n` },
      ],
    })
    await page.goto(`./#/tree/${REPO}/${leaf}`)
    await signInHere(page)
    const image = page.locator('.cm-content .cm-image')
    await expect(image.getByRole('img', { name: 'Realm' })).toBeVisible()
    await image.scrollIntoViewIfNeeded()
    const column = (await image.boundingBox())!.width

    /** Drags one side of the image by `dx` pixels, then waits for the autosave's commit. */
    async function drag(side: 'start' | 'end', dx: number) {
      await image.hover()
      const box = (await image.locator(`[data-side="${side}"]`).boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + box.height / 2)
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2)
      await page.mouse.up()
      await autosave()
    }
    async function autosave() {
      await page.clock.fastForward('00:01')
      await expect(page.getByRole('status')).toContainText('Unsaved edits')
      await page.clock.fastForward('02:05')
      await expect(page.getByRole('status')).toHaveText('Synced to main')
    }

    // Each side moves the other with it: a quarter of the width inwards halves the image.
    await drag('end', -column / 4)
    await expect
      .poll(() => repo.read(leaf))
      .toMatch(/!\[Realm\]\(\/assets\/realm\.png "width=5\d%"\)/)
    const half = (await image.boundingBox())!
    expect(half.width / column).toBeCloseTo(0.5, 1)
    // Centred: the space left of it is the space right of it.
    const line = (await page.locator('.cm-content').boundingBox())!
    expect(Math.abs(half.x - line.x - (line.x + line.width - half.x - half.width))).toBeLessThan(24)

    // Past the column, outwards from the other side: full width, and the title goes.
    await drag('start', -column / 2)
    await expect.poll(() => repo.read(leaf)).toContain('![Realm](/assets/realm.png)\n')

    // From the keyboard, the handle is a slider over the width.
    const slider = page.getByRole('slider', { name: 'Width of Realm' })
    await expect(slider).toHaveAttribute('aria-valuenow', '100')
    await slider.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(slider).toHaveAttribute('aria-valuenow', '90')
    await expect(slider).toBeFocused()
    await autosave()
    await expect.poll(() => repo.read(leaf)).toContain('![Realm](/assets/realm.png "width=90%")')
  })
})

for (const dpr of [2, 3]) {
  test.describe(`images at pixel density ${dpr}`, () => {
    test.skip(({ isMobile }) => isMobile, 'Desktop engines')
    test.use({ deviceScaleFactor: dpr })

    test('the read view shows the original image, never a smaller copy', async ({
      page,
      fake,
      graph,
    }, info) => {
      const leaf = pair(graph).from.id
      const png = await page.evaluate(async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 1200
        canvas.height = 600
        const c = canvas.getContext('2d')!
        c.fillStyle = 'white'
        c.fillRect(0, 0, 1200, 600)
        c.fillStyle = 'black'
        c.font = '28px sans-serif'
        for (let y = 50; y < 600; y += 50)
          c.fillText('Fine print stays sharp at every density', 30, y)
        const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
        return [...new Uint8Array(await blob.arrayBuffer())]
      })
      const repo = fake.repo(REPO)
      await repo.commit({
        message: 'image',
        additions: [
          { path: 'assets/fine-print.png', contents: new Uint8Array(png) },
          { path: leaf, contents: `${repo.read(leaf)}\n![Fine print](/assets/fine-print.png)\n` },
        ],
      })
      await page.goto(`./#/tree/${REPO}/${leaf}`)
      await signInHere(page)
      await page.getByRole('button', { name: 'Open full page' }).click()
      const img = page.getByRole('img', { name: 'Fine print' })
      await expect(img).toBeVisible()
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1200)
      await info.attach(`fine-print-dpr${dpr}`, {
        body: await img.screenshot(),
        contentType: 'image/png',
      })
    })
  })
}

test.describe('embeds', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines; the leaf is the same on phones')

  const LEAF = [
    '# Embeds',
    '',
    'Euler: $e^{i\\pi} + 1 = 0$, and it costs $5 and $10.',
    '',
    '```ts',
    'const answer: number = 42 // the answer',
    '```',
    '',
    '[OIDC spec](/assets/oidc.pdf)',
    '',
    '[Demo](/assets/demo.mp4)',
    '',
    '[The talk](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
    '',
    'Kept as a list (owner’s notes are):',
    '',
    '- https://youtu.be/dQw4w9WgXcQ',
    '- $x^2$',
    '',
  ].join('\n')

  test.beforeEach(async ({ fake }) => {
    await fake.repo(REPO).commit({
      message: 'embeds',
      additions: [
        { path: 'embeds.md', contents: LEAF },
        { path: 'assets/oidc.pdf', contents: '%PDF-1.4\n%%EOF\n' },
        { path: 'assets/demo.mp4', contents: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]) },
        { path: 'assets/demo.en.vtt', contents: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n' },
      ],
    })
  })

  test('the Peek shows math, highlighted code, a PDF, a subtitled video and YouTube', async ({
    page,
  }) => {
    await page.goto(`./#/tree/${REPO}/embeds.md`)
    await signInHere(page)
    const body = page.getByRole('region', { name: 'Leaf preview' })
    await expect(body.locator('.katex')).toHaveCount(2)
    await expect(body.getByText('it costs $5 and $10.')).toBeVisible()
    await expect(body.locator('.cm-code-block .tok-keyword').first()).toHaveText('const')
    await expect(body.locator('.cm-embed-pdf iframe')).toHaveAttribute('src', /^blob:/)
    await expect(body.getByRole('link', { name: 'Download OIDC spec' })).toHaveAttribute(
      'href',
      /^blob:/,
    )
    await expect(body.locator('video')).toHaveAttribute('src', /^blob:/)
    await expect(body.locator('video track')).toHaveAttribute('src', /^blob:/)
    await expect(body.locator('video track')).toHaveAttribute('label', 'English')
    await expect(body.locator('iframe[title="The talk"]')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
  })

  test('live preview shows math and players away from the cursor', async ({ page }) => {
    await page.goto(`./#/tree/${REPO}/embeds.md`)
    await signInHere(page)
    const editor = page.locator('.cm-content')
    await expect(editor.locator('.cm-math .katex')).toHaveCount(2)
    // The paragraph's player, and the list item's, which keeps its bullet.
    await expect(editor.locator('.cm-embed-youtube iframe')).toHaveCount(2)
    await expect(editor.locator('.cm-line:has(.cm-embed-youtube) .cm-bullet')).toHaveCount(1)
    await expect(editor.locator('.cm-embed-video video')).toHaveAttribute('src', /^blob:/)
    // Writing elsewhere on its line keeps the math drawn (issue #68); clicking it shows its source.
    await editor.getByText('Euler').click()
    await expect(editor.locator('.cm-math .katex')).toHaveCount(2)
    await editor.locator('.cm-math').first().click()
    await expect(editor.locator('.cm-math')).toHaveCount(1)
    await expect(editor).toContainText('$e^{i\\pi} + 1 = 0$')
  })

  test("plays a /live/ link and YouTube's own embed code pasted under an image", async ({
    page,
    fake,
  }) => {
    await fake.repo(REPO).commit({
      message: 'videos',
      additions: [
        {
          path: 'videos.md',
          contents: [
            '# Videos',
            '',
            '[Live](https://www.youtube.com/live/dQw4w9WgXcQ?si=x)',
            '',
            '![Shot](https://example.com/shot.png)',
            '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=x" title="YouTube video player" allowfullscreen></iframe>',
            '',
          ].join('\n'),
        },
      ],
    })
    await page.goto(`./#/tree/${REPO}/videos.md`)
    await signInHere(page)
    const players = page.locator('.cm-content .cm-embed-youtube iframe')
    await expect(players).toHaveCount(2)
    for (const player of await players.all())
      await expect(player).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      )
  })
})

test.describe('what github.com renders', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines; the leaf is the same on phones')

  test('live preview shows alerts, footnote marks and Mermaid diagrams', async ({ page, fake }) => {
    await fake.repo(REPO).commit({
      message: 'blocks',
      additions: [
        {
          path: 'blocks.md',
          contents: [
            '# Blocks',
            '',
            '> [!WARNING]',
            '> Mind the gap.',
            '',
            'A claim[^1].',
            '',
            '```mermaid',
            'graph TD',
            '  Realm --> Client',
            '```',
            '',
            '[^1]: The source.',
            '',
          ].join('\n'),
        },
      ],
    })
    await page.goto(`./#/tree/${REPO}/blocks.md`)
    await signInHere(page)
    const editor = page.locator('.cm-content')
    await expect(editor.locator('.cm-callout-title')).toHaveText('Warning')
    await expect(editor.locator('.cm-line.cm-callout-warning')).toHaveCount(2)
    await expect(editor.locator('.cm-footnote').first()).toHaveText('1')
    const diagram = editor.locator('.cm-diagram svg')
    await expect(diagram).toBeVisible({ timeout: 15_000 })
    await expect(diagram).toContainText('Client')
    // A click on the diagram shows its source, to edit.
    await diagram.click()
    await expect(editor.locator('.cm-diagram')).toHaveCount(0)
    await expect(editor).toContainText('Realm --> Client')
  })
})

test.describe('leaf styling', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines')

  test('colours and a cover go on line 2, and show in the theme', async ({ page, fake, graph }) => {
    const leaf = pair(graph).from.id
    await page.goto(`./#/tree/${REPO}/${leaf}`)
    await signInHere(page)
    await page.getByRole('button', { name: 'Heading colour' }).click()
    await page.getByRole('menuitemradio', { name: 'Amber' }).click()
    await page.getByRole('button', { name: 'Text colour' }).click()
    await page.getByRole('menuitemradio', { name: 'Blue' }).click()
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1500
      canvas.height = 500
      canvas.getContext('2d')!.fillRect(0, 0, 1500, 500)
      return canvas.toDataURL('image/png')
    })
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Add cover' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'Mount Ararat.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'),
    })
    await expect(page.getByRole('button', { name: 'Change cover' })).toBeVisible()
    await expect(page.locator('main img').first()).toHaveAttribute('src', /^blob:/)

    await expect(page.getByRole('status')).toContainText('Unsaved edits')
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read(leaf)?.split('\n')[1])
      .toMatch(
        /^<!-- yeraz \{"color":\{"heading":"amber","text":"blue"\},"cover":"\/assets\/\d{4}-\d{2}-\d{2}-mount-ararat\.png"\} -->$/,
      )

    const peek = page.getByRole('region', { name: 'Leaf preview' })
    const amber = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--c-amber').trim(),
    )
    const article = peek.locator('[data-leaf]')
    expect(amber).toMatch(/^#[0-9A-Fa-f]{6}$/)
    await expect(article).toHaveCSS('--leaf-heading', amber)
  })

  test('Undo of a cover takes it off the header, and a later change does not write it back', async ({
    page,
    fake,
    graph,
  }) => {
    const leaf = pair(graph).from.id
    await page.goto(`./#/tree/${REPO}/${leaf}`)
    await signInHere(page)
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 300
      canvas.height = 100
      canvas.getContext('2d')!.fillRect(0, 0, 300, 100)
      return canvas.toDataURL('image/png')
    })
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Add cover' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'a.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'),
    })
    await expect(page.getByRole('button', { name: 'Change cover' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Leaf text' }).click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByRole('button', { name: 'Add cover' })).toBeVisible()
    await page.getByRole('button', { name: 'Heading colour' }).click()
    await page.getByRole('menuitemradio', { name: 'Amber' }).click()
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read(leaf)?.split('\n')[1])
      .toBe('<!-- yeraz {"color":{"heading":"amber"}} -->')
  })
})

test.describe('leaf colours', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines')

  test('a raw hex heading colour is drawn adjusted to stay readable in each mode', async ({
    page,
    fake,
  }) => {
    await fake.repo(REPO).commit({
      message: 'A navy heading',
      additions: [
        {
          path: 'navy.md',
          contents:
            '# Navy\n<!-- yeraz {"color":{"heading":"#1A2B6D"}} -->\n\n## Inside\n\nText.\n',
        },
      ],
    })
    const rgb = (hex: string) =>
      `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
    await page.goto(`./#/tree/${REPO}/navy.md`)
    await signInHere(page)
    const peek = page.getByRole('region', { name: 'Leaf preview' })
    const heading = peek.locator('.cm-h2', { hasText: 'Inside' })
    const leaf = peek.locator('[data-leaf]')
    const value = (mode: string) =>
      leaf.evaluate((el, m) => el.style.getPropertyValue(`--leaf-heading-${m}`), mode)
    // The Peek shows structure first, then content: wait for the leaf's own text.
    await expect(heading).toBeVisible()
    await expect.poll(() => value('dark')).not.toBe('')
    const [dark, light] = [await value('dark'), await value('light')]
    // Navy on near-black is unreadable: lighter on dark bases, and Paper keeps it as it is.
    expect(dark).toMatch(/^#[0-9A-F]{6}$/)
    expect(dark).not.toBe('#1A2B6D')
    expect(light).toBe('#1A2B6D')
    await expect(heading).toHaveCSS('color', rgb(dark))
    await page.evaluate(() => {
      document.documentElement.dataset.base = 'paper'
      document.documentElement.dataset.mode = 'light'
    })
    await expect(heading).toHaveCSS('color', rgb(light))
  })
})

test.describe('cover position', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines')

  test('Add icon sits beside Add cover; a dragged cover keeps its position on line 2', async ({
    page,
    fake,
    graph,
  }) => {
    const leaf = pair(graph).from.id
    await page.goto(`./#/tree/${REPO}/${leaf}`)
    await signInHere(page)
    const addIcon = page.getByRole('button', { name: 'Add icon' })
    const addCover = page.getByRole('button', { name: 'Add cover' })
    await expect(addCover).toBeVisible()
    const [iconBox, coverBox] = [await addIcon.boundingBox(), await addCover.boundingBox()]
    expect(iconBox!.y).toBe(coverBox!.y)
    expect(iconBox!.height).toBe(coverBox!.height)
    expect(iconBox!.x).toBeLessThan(coverBox!.x)

    // A photo taller than the 3:1 slot, so there is something to move.
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1500
      canvas.height = 1000
      canvas.getContext('2d')!.fillRect(0, 0, 1500, 1000)
      return canvas.toDataURL('image/png')
    })
    const chooser = page.waitForEvent('filechooser')
    await addCover.click()
    await (
      await chooser
    ).setFiles({
      name: 'Ararat.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'),
    })
    // Reposition is in the cover's one button (with Upload and Remove).
    await page.getByRole('button', { name: 'Change cover' }).click()
    await page.getByRole('menuitem', { name: 'Reposition' }).click()
    const cover = page.getByRole('slider', { name: 'Cover position' })
    await expect(cover).toHaveAttribute('aria-valuenow', '50')
    // The drag is measured against the photo's own size: once it has loaded. Picking
    // Reposition may have scrolled the menu into view and the cover out of it.
    await expect
      .poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalHeight))
      .toBeGreaterThan(0)
    await cover.scrollIntoViewIfNeeded()
    const box = (await cover.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 2000, { steps: 4 })
    await page.mouse.up()
    await expect(cover).toHaveAttribute('aria-valuenow', '0')
    await cover.press('ArrowUp')
    await expect(cover).toHaveAttribute('aria-valuenow', '5')
    await page.getByRole('button', { name: 'Save position' }).click()
    await expect(page.getByRole('slider')).toHaveCount(0)
    await expect(page.locator('main img').first()).toHaveCSS('object-position', '50% 5%')

    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read(leaf)?.split('\n')[1])
      .toMatch(/"coverPosition":5\b/)
  })
})

test.describe('icons', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop engines')

  test('every emoji can be found by name or keyword; Enter picks it and line 1 gets it', async ({
    page,
    fake,
    graph,
  }) => {
    const leaf = pair(graph).from
    await page.goto(`./#/tree/${REPO}/${leaf.id}`)
    await signInHere(page)
    // No wait for the editor: the button appears with it, so an early pick isn't lost.
    await page.getByRole('button', { name: /^(Add icon|Change icon)/ }).click()
    await page.getByRole('menuitem', { name: 'Choose an emoji' }).click()
    const icons = page.getByRole('group', { name: 'Icons' })
    const search = icons.getByRole('searchbox', { name: 'Search emoji' })
    await expect(search).toBeFocused()
    // With no search, every emoji, by group: far more than fits on screen.
    await expect(icons.getByRole('region', { name: 'Flags' })).toBeAttached()
    expect(await icons.getByRole('button').count()).toBeGreaterThan(1800)
    // The last column clear of the scrollbar.
    const room = await page.evaluate(() => {
      const first = document.querySelector('[aria-label="Icons"] section button:nth-child(8)')
      const list = first!.closest('[class*="emojiList"]')!
      const r = list.getBoundingClientRect()
      return r.left + list.clientWidth - first!.getBoundingClientRect().right
    })
    expect(room).toBeGreaterThanOrEqual(4)

    await search.fill('xyzzy')
    await expect(icons).toContainText('No emoji for “xyzzy”')
    await search.fill('secure')
    await expect(icons.getByRole('button', { name: 'locked with key' })).toBeVisible()
    await search.press('Enter')
    await expect(icons).toBeHidden()
    await expect(page.getByRole('button', { name: 'Change icon 🔐' })).toBeVisible()

    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fake.repo(REPO).read(leaf.id)?.split('\n')[0])
      .toBe(`# 🔐 ${leaf.title}`)
  })
})

test.describe('other repositories', () => {
  test.beforeEach(async ({ fake }) => {
    await fake.addRepo('you/art', {
      '.yeraz.json': '{"name":"Art History","color":"amber"}\n',
      'baroque.md': '# Baroque\n\nOrnament and counterpoint.\n',
    })
    await fake.repo(REPO).commit({
      message: 'links',
      additions: [
        {
          path: 'links.md',
          contents:
            '# Links\n\nSee [Baroque](https://github.com/you/art/blob/main/baroque.md).\n\nhttps://github.com/you/art\n',
        },
      ],
    })
  })

  test('links and cards to another Family open it in the app', async ({ page }) => {
    await page.goto(`./#/tree/${REPO}/links.md`)
    await signInHere(page)
    const peek = page.getByRole('region', { name: 'Leaf preview' })
    await expect(peek.getByRole('link', { name: /Art History/ })).toContainText('Family')
    await peek.locator('.cm-mention', { hasText: 'Baroque' }).click()
    await expect(page).toHaveURL(/#\/tree\/you\/art\/baroque\.md$/)
    await expect(page.getByRole('heading', { name: 'Baroque' })).toBeVisible()
  })
})
