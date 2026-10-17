import { describe, expect, it } from 'vitest'
import { bodyOf, renderLeaf, type RenderContext } from './render'

const context: RenderContext = {
  leafHref: (path) => (path === 'identity/oidc.md' ? '#/tree/you/eng/identity/oidc.md' : null),
  leafIcon: (path) => (path === 'identity/oidc.md' ? '🔐' : null),
}

describe('bodyOf', () => {
  it('drops the title line and the metadata line', () => {
    expect(bodyOf('# Title\n<!-- yeraz {"cover":"x"} -->\n\nBody\n')).toBe('\nBody\n')
    expect(bodyOf('# Title\r\n\r\nBody')).toBe('\nBody')
    expect(bodyOf('No title\n<!-- yeraz {} -->\n')).toBe('No title\n<!-- yeraz {} -->\n')
  })
})

describe('renderLeaf', () => {
  it('renders Markdown without the title, headings one level below it', async () => {
    const html = await renderLeaf(
      '# Keycloak\n\n## How we use it\n\nText with **bold**.\n',
      context,
    )
    expect(html).not.toContain('Keycloak')
    expect(html).toContain('<h3>How we use it</h3>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('turns links to leaves of this Tree into @ chips with the leaf icon', async () => {
    const html = await renderLeaf('# T\n\nSee [OpenID Connect](/identity/oidc.md).\n', context)
    expect(html).toContain(
      '<a href="#/tree/you/eng/identity/oidc.md" class="mention" data-before="@ 🔐 ">OpenID Connect</a>',
    )
  })

  it('keeps unknown leaf links as plain links, and opens web links in a new tab', async () => {
    const html = await renderLeaf(
      '# T\n\n[gone](/gone.md) and [site](https://example.com)\n',
      context,
    )
    expect(html).toContain('<a href="/gone.md">gone</a>')
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>',
    )
  })

  it('shows raw HTML as text instead of running it', async () => {
    const html = await renderLeaf(
      '# T\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n',
      context,
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('refuses javascript: links', async () => {
    const html = await renderLeaf('# T\n\n[x](javascript:alert(1))\n', context)
    expect(html).not.toContain('href="javascript:')
  })

  it('renders task lists as checkboxes', async () => {
    const html = await renderLeaf('# T\n\n- [x] Done\n- [ ] Open\n- plain\n', context)
    expect(html).toContain('<li class="task"><input type="checkbox" disabled checked> Done</li>')
    expect(html).toContain('<li class="task"><input type="checkbox" disabled> Open</li>')
    expect(html).toContain('<li>plain</li>')
  })

  it('marks the Tree’s own images for the app to show, lazily; web images load as they are', async () => {
    const html = await renderLeaf(
      '# T\n\n![Realm diagram](/assets/2026-10-14-realm.png)\n\n![Logo](https://example.com/l.png)\n',
      context,
    )
    expect(html).toContain(
      '<img alt="Realm diagram" data-asset="assets/2026-10-14-realm.png" loading="lazy" decoding="async">',
    )
    expect(html).toContain(
      '<img src="https://example.com/l.png" alt="Logo" loading="lazy" decoding="async">',
    )
  })

  it('renders $inline$ and $$display$$ math with KaTeX, leaving prices alone', async () => {
    const html = await renderLeaf(
      '# T\n\nEuler: $e^{i\\pi} + 1 = 0$, costs $5 and $10.\n\n$$\n\\int_0^1 x\\,dx = \\tfrac12\n$$\n',
      context,
    )
    expect(html).toMatch(
      /<span class="katex">.*<annotation encoding="application\/x-tex">e\^\{i\\pi\} \+ 1 = 0<\/annotation>/s,
    )
    expect(html).toContain('costs $5 and $10.')
    expect(html).toContain('<span class="katex-display">')
    expect(html).not.toContain('$$')
  })

  it('shows broken math as its source instead of failing', async () => {
    const html = await renderLeaf('# T\n\n$\\frac{1}$\n', context)
    expect(html).toContain('katex-error')
  })

  it('highlights code with the same Lezer parsers as the editor', async () => {
    const html = await renderLeaf('# T\n\n```js\nconst a = "x" // note\n```\n', context)
    expect(html).toContain('<pre><code class="language-js">')
    expect(html).toContain('<span class="tok-keyword">const</span>')
    expect(html).toContain('<span class="tok-string">&quot;x&quot;</span>')
    expect(html).toContain('<span class="tok-comment">// note</span>')
  })

  it('leaves code in unknown languages plain and escaped', async () => {
    const html = await renderLeaf('# T\n\n```nope\n<b>\n```\n', context)
    expect(html).toContain('<pre><code class="language-nope">&lt;b&gt;\n</code></pre>')
  })

  it('embeds YouTube, PDFs and videos written as a paragraph of one link', async () => {
    const html = await renderLeaf(
      [
        '# T',
        '',
        '[Talk](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90)',
        '',
        '[OIDC spec](/assets/oidc.pdf)',
        '',
        '[Demo](/assets/demo.mp4)',
        '',
        'A link in a sentence: https://youtu.be/dQw4w9WgXcQ stays a link.',
      ].join('\n'),
      { ...context, files: () => ['assets/demo.mp4', 'assets/demo.en.vtt', 'assets/demo.hy.vtt'] },
    )
    expect(html).toContain(
      '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90" title="Talk"',
    )
    expect(html).toContain('<iframe class="pdf" data-asset="assets/oidc.pdf" title="OIDC spec"')
    expect(html).toContain('<a data-asset-href="assets/oidc.pdf" download="oidc.pdf">')
    expect(html).toContain(
      '<video controls preload="metadata" data-asset="assets/demo.mp4" title="Demo">',
    )
    expect(html).toContain(
      '<track kind="subtitles" srclang="en" label="English" data-asset="assets/demo.en.vtt" default>',
    )
    expect(html).toContain(
      '<track kind="subtitles" srclang="hy" label="Armenian" data-asset="assets/demo.hy.vtt">',
    )
    expect(html).toContain('<a href="https://youtu.be/dQw4w9WgXcQ"')
  })

  it('shows any other file in assets/ as a card that downloads it, with its type and size', async () => {
    const html = await renderLeaf(
      [
        '# T',
        '',
        '[Q3 <report>.xlsx](/assets/2026-10-17-q3-report.xlsx)',
        '',
        '/assets/Makefile',
      ].join('\n'),
      { ...context, size: (path) => (path.endsWith('.xlsx') ? 1_258_291 : null) },
    )
    expect(html).toContain(
      '<p><button type="button" class="file-card" data-asset-file="assets/2026-10-17-q3-report.xlsx" ' +
        'aria-label="Download Q3 &lt;report&gt;.xlsx, XLSX · 1.2 MB">' +
        '<strong>Q3 &lt;report&gt;.xlsx</strong><span>2026-10-17-q3-report.xlsx</span>' +
        '<em>XLSX · 1.2 MB</em></button></p>',
    )
    expect(html).toContain(
      'aria-label="Download Makefile, File"><strong>Makefile</strong><em>File</em></button></p>',
    )
  })

  it('shows repositories as cards, and links to other Trees as chips that stay in the app', async () => {
    const tree = (repo: string) =>
      repo.toLowerCase() === 'you/art' ? { title: 'Art History', href: '#/tree/you/art' } : null
    const html = await renderLeaf(
      [
        '# T',
        '',
        'https://github.com/you/art',
        '',
        '[Their code](https://github.com/someone/tool)',
        '',
        'See [Baroque](https://github.com/you/art/blob/main/periods/baroque.md) and [x](https://github.com/someone/else/blob/main/x.md).',
      ].join('\n'),
      { ...context, tree },
    )
    expect(html).toContain(
      '<a class="repo-card" href="#/tree/you/art"><strong>Art History</strong><span>you/art</span><em>Tree</em></a>',
    )
    expect(html).toContain(
      '<a class="repo-card" href="https://github.com/someone/tool" target="_blank" rel="noopener noreferrer"><strong>Their code</strong>',
    )
    expect(html).toContain(
      '<a href="#/tree/you/art/periods/baroque.md" class="mention" data-before="@ ">Baroque</a>',
    )
    expect(html).toContain(
      '<a href="https://github.com/someone/else/blob/main/x.md" target="_blank"',
    )
  })

  it('shows a titled link alone in its paragraph as a bookmark; a bare URL stays a link', async () => {
    const html = await renderLeaf(
      [
        '# T',
        '',
        '[Baroque <art>](https://en.wikipedia.org/wiki/Baroque)',
        '',
        'https://example.com/post',
        '',
        'Read [this](https://example.com/a) first.',
      ].join('\n'),
      context,
    )
    expect(html).toContain(
      '<p><a class="repo-card bookmark" href="https://en.wikipedia.org/wiki/Baroque" target="_blank" rel="noopener noreferrer">' +
        '<strong>Baroque &lt;art&gt;</strong><span>en.wikipedia.org/wiki/Baroque</span></a></p>',
    )
    expect(html).toContain('<p><a href="https://example.com/post" target="_blank"')
    expect(html).toContain('Read <a href="https://example.com/a" target="_blank"')
  })

  it('caches by blob SHA', async () => {
    const first = await renderLeaf('# T\n\nOne\n', context, 'sha-1')
    expect(await renderLeaf('# T\n\nChanged\n', context, 'sha-1')).toBe(first)
  })
})
