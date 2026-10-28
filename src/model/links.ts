// Rewriting threads when leaves move (ARCHITECTURE.md §4: root-relative links, so only
// links pointing *to* a moved leaf change). Everything else in the text stays byte for byte.

import { codeRanges, LINK, linkTarget, ownPath } from './parse'

/** A root-relative destination for `path`, in angle brackets when it needs them. */
export function destination(path: string): string {
  return /[\s()<>]/.test(path) ? `</${path}>` : `/${path}`
}

/** `[Title](/path.md)`: a thread, as the repository format writes it (ARCHITECTURE.md §4). */
export function mentionLink(title: string, path: string): string {
  return `[${title.replace(/[[\]\\]/g, '\\$&')}](${destination(path)})`
}

/**
 * Rewrites links whose target moved (`moves`: old path → new path), outside code.
 * Anchors (`#part`) and link titles are kept.
 */
export const rewriteLinks = (text: string, moves: ReadonlyMap<string, string>) =>
  rewrite(text, moves, (dest, bang) => {
    const target = bang ? null : linkTarget(dest)
    return target && target.repo === null ? target.path : null
  })

/**
 * Rewrites links and images to files of this Tree that got a new name (`moves`), such as an
 * image saved beside another device's of the same name (sync/merge.ts).
 */
export const rewriteFileLinks = (text: string, moves: ReadonlyMap<string, string>) =>
  rewrite(text, moves, (dest) => ownPath(dest)?.replace(/[?#].*$/, '') ?? null)

function rewrite(
  text: string,
  moves: ReadonlyMap<string, string>,
  pathOf: (dest: string, bang: boolean) => string | null,
): string {
  if (moves.size === 0) return text
  const code = codeRanges(text)
  const inCode = (at: number) => code.some(([start, end]) => at >= start && at < end)
  let out = ''
  let last = 0
  for (const m of text.matchAll(LINK)) {
    const [whole, bang, , dest] = m
    if (inCode(m.index)) continue
    const path = pathOf(dest!, !!bang)
    const moved = path === null ? undefined : moves.get(path)
    if (moved === undefined) continue
    const anchor = /#[^>]*/.exec(dest!.replace(/^<|>$/g, ''))?.[0] ?? ''
    const start = m.index + whole.lastIndexOf(dest!)
    out += text.slice(last, start) + destination(moved + anchor)
    last = start + dest!.length
  }
  return out + text.slice(last)
}
