import { describe, expect, it } from 'vitest'
import { embedOf, mathSpans, subtitleTracks } from './embeds'

describe('embedOf: a paragraph that is only a link becomes an embed', () => {
  it('YouTube, as a bare URL, an autolink or a Markdown link, with a start time', () => {
    const video = { kind: 'youtube', id: 'dQw4w9WgXcQ', start: 0, title: '' }
    expect(embedOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(video)
    expect(embedOf('<https://youtu.be/dQw4w9WgXcQ>')).toEqual(video)
    expect(embedOf('[The talk](https://youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s)')).toEqual({
      ...video,
      title: 'The talk',
      start: 90,
    })
    expect(embedOf('https://youtu.be/dQw4w9WgXcQ?t=42')).toEqual({ ...video, start: 42 })
    expect(embedOf('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual(video)
  })

  it('PDFs and videos kept in the Tree', () => {
    expect(embedOf('[Spec](/assets/2026-10-14-oidc-spec.pdf)')).toEqual({
      kind: 'pdf',
      path: 'assets/2026-10-14-oidc-spec.pdf',
      title: 'Spec',
    })
    expect(embedOf('[Demo](</assets/demo video.mp4>)')).toEqual({
      kind: 'video',
      path: 'assets/demo video.mp4',
      title: 'Demo',
    })
    expect(embedOf('/assets/clip.webm')).toEqual({
      kind: 'video',
      path: 'assets/clip.webm',
      title: '',
    })
  })

  it('repositories on GitHub, as cards', () => {
    expect(embedOf('https://github.com/you/art-history')).toEqual({
      kind: 'repo',
      repo: 'you/art-history',
      title: '',
    })
    expect(embedOf('[Our notes](https://github.com/you/notes/)')).toEqual({
      kind: 'repo',
      repo: 'you/notes',
      title: 'Our notes',
    })
    expect(embedOf('https://github.com/you/notes/blob/main/a.md')).toBeNull()
    expect(embedOf('https://github.com/you')).toBeNull()
  })

  it('leaves links inside sentences, and other links, as links', () => {
    expect(embedOf('Watch https://youtu.be/dQw4w9WgXcQ now')).toBeNull()
    expect(embedOf('[Keycloak](/identity/keycloak.md)')).toBeNull()
    expect(embedOf('https://example.com/a.pdf')).toBeNull()
    expect(embedOf('https://www.youtube.com/@channel')).toBeNull()
  })
})

describe('subtitleTracks', () => {
  it('finds name.<lang>.vtt beside a video, the first one the default', () => {
    const files = [
      'assets/talk.mp4',
      'assets/talk.en.vtt',
      'assets/talk.hy.vtt',
      'assets/talk-2.en.vtt',
      'assets/other.vtt',
    ]
    expect(subtitleTracks('assets/talk.mp4', files)).toEqual([
      { path: 'assets/talk.en.vtt', lang: 'en' },
      { path: 'assets/talk.hy.vtt', lang: 'hy' },
    ])
  })

  it('takes name.vtt as a track without a language', () => {
    expect(subtitleTracks('assets/a.webm', ['assets/a.vtt'])).toEqual([
      { path: 'assets/a.vtt', lang: '' },
    ])
  })
})

describe('mathSpans: $inline$ and $$display$$, as GitHub writes them', () => {
  it('finds inline and display math', () => {
    const inline = '$e^{i\\pi} + 1 = 0$'
    const display = '$$\\sum_{n=1}^\\infty \\frac{1}{n^2}$$'
    const text = `Euler: ${inline} and ${display}.`
    expect(mathSpans(text)).toEqual([
      { from: 7, to: 7 + inline.length, tex: inline.slice(1, -1), display: false },
      {
        from: text.indexOf(display),
        to: text.indexOf(display) + display.length,
        tex: display.slice(2, -2),
        display: true,
      },
    ])
  })

  it('finds display math over several lines', () => {
    expect(mathSpans('$$\na^2 + b^2\n= c^2\n$$')).toEqual([
      { from: 0, to: 21, tex: '\na^2 + b^2\n= c^2\n', display: true },
    ])
  })

  it('ignores prices, escaped dollars and dollars in code', () => {
    expect(mathSpans('It costs $5 and $10.')).toEqual([])
    expect(mathSpans('Not \\$x\\$ math')).toEqual([])
    expect(mathSpans('Code `$x$` here')).toEqual([])
    expect(mathSpans('$ x $ has spaces inside')).toEqual([])
  })
})
