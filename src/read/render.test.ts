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

  it('caches by blob SHA', async () => {
    const first = await renderLeaf('# T\n\nOne\n', context, 'sha-1')
    expect(await renderLeaf('# T\n\nChanged\n', context, 'sha-1')).toBe(first)
  })
})
