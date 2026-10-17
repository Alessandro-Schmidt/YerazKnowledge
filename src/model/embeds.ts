// Embeds (ARCHITECTURE.md §7, §8), written so a leaf still reads well on github.com:
// - a paragraph that is only a link to a YouTube video, or to a PDF or video in the Tree,
//   becomes a player; one to a GitHub repository becomes a card; on GitHub it stays a link;
// - a video's subtitles are `name.<lang>.vtt` files beside it;
// - math is $inline$ and $$display$$, as GitHub writes it.
// Shared by the read view and the editor's live preview. Pure.

import { codeRanges, ownPath } from './parse'

export type Embed =
  | { kind: 'youtube'; id: string; start: number; title: string }
  | { kind: 'pdf' | 'video'; path: string; title: string }
  | { kind: 'repo'; repo: string; title: string }

const YOUTUBE =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?=$|[?&#])/

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds. */
function seconds(t: string | null): number {
  if (!t) return 0
  if (/^\d+$/.test(t)) return Number(t)
  const [, h, m, s] = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t) ?? []
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
}

export function embedOf(paragraph: string): Embed | null {
  const p = paragraph.trim()
  let title = ''
  let dest = p
  const link = /^\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]*>|\S+?)\s*\)$/.exec(p)
  if (link) {
    title = link[1]!.replace(/\\(.)/g, '$1')
    dest = link[2]!
  } else if (/^<[^>\s]+>$/.test(p)) dest = p.slice(1, -1)
  else if (/\s/.test(p)) return null

  const url = dest.replace(/^<|>$/g, '')
  const video = YOUTUBE.exec(url)
  if (video) {
    const params = new URL(url).searchParams
    const start = seconds(params.get('t') ?? params.get('start'))
    return { kind: 'youtube', id: video[1]!, start, title }
  }
  const repo = /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url)
  if (repo) return { kind: 'repo', repo: repo[1]!, title }
  const own = ownPath(dest)
  if (own && /\.pdf$/i.test(own)) return { kind: 'pdf', path: own, title }
  if (own && /\.(mp4|webm)$/i.test(own)) return { kind: 'video', path: own, title }
  return null
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
/** A subtitle track's label: `hy` → "Armenian". */
export const languageName = (code: string) => {
  try {
    return languageNames.of(code) ?? code
  } catch {
    return code
  }
}

/** Subtitle files for a video: `talk.mp4` → `talk.en.vtt`, `talk.hy.vtt` (or `talk.vtt`). */
export function subtitleTracks(
  video: string,
  files: Iterable<string>,
): { path: string; lang: string }[] {
  const base = video.replace(/\.[^./]+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const track = new RegExp(`^${base}(?:\\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)?))?\\.vtt$`)
  return [...files]
    .map((path) => ({ path, lang: track.exec(path)?.[1] }))
    .filter((t): t is { path: string; lang: string } => t.lang !== undefined || track.test(t.path))
    .map(({ path, lang }) => ({ path, lang: lang ?? '' }))
}

export interface MathSpan {
  from: number
  to: number
  tex: string
  display: boolean
}

// $$…$$ (any lines), or $…$ on one line: not after a backslash, a $ or a letter; no space
// just inside the dollars; no digit right after the closing one (so "$5 and $10" is text).
export const MATH =
  /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$|(?<![\\$\w])\$(?![\s$])((?:\\.|[^$\n\\])+?)(?<![\s\\])\$(?![\d$\w])/g

/** Math in a text, outside code, in order. */
export function mathSpans(text: string): MathSpan[] {
  const code = codeRanges(text)
  const inCode = (at: number) => code.some(([start, end]) => at >= start && at < end)
  const spans: MathSpan[] = []
  for (const m of text.matchAll(MATH)) {
    if (inCode(m.index)) continue
    spans.push({
      from: m.index,
      to: m.index + m[0].length,
      tex: m[1] ?? m[2]!,
      display: m[1] !== undefined,
    })
  }
  return spans
}
