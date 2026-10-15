// A leaf's look from its line-2 metadata (ARCHITECTURE.md §7, §13): the cover, and text and
// heading colours. Colours are names resolved by the theme; leaf → Tree → accent.

import { useEffect, useState, type CSSProperties } from 'react'
import type { LeafMeta } from '../model/parse'
import { ownPath } from '../model/parse'
import { session } from '../store/session'
import { ACCENT_IDS } from '../ui/theme'

const named = (name: unknown) =>
  typeof name === 'string' && (ACCENT_IDS as string[]).includes(name)
    ? `var(--c-${name})`
    : undefined

/** `--leaf-heading` and `--leaf-text` for the leaf's container, when the leaf sets them. */
export function leafColors(meta: LeafMeta | null | undefined): CSSProperties {
  const style: Record<string, string> = {}
  const heading = named(meta?.color?.heading)
  const text = named(meta?.color?.text)
  if (heading) style['--leaf-heading'] = heading
  if (text) style['--leaf-text'] = text
  return style as CSSProperties
}

/** The cover: an image in the Tree (`/assets/…`, through the blob cache) or on the web. */
export function Cover({
  repo,
  src,
  className,
}: {
  repo: string
  src: unknown
  className?: string
}) {
  const own = typeof src === 'string' ? ownPath(src) : null
  const web = typeof src === 'string' && /^https:\/\//.test(src) ? src : null
  const [url, setUrl] = useState<{ path: string; url: string | null } | null>(null)
  useEffect(() => {
    if (own === null) return
    let live = true
    void session
      .getState()
      .assetUrl(repo, own)
      .then((u) => live && setUrl({ path: own, url: u }))
    return () => {
      live = false
    }
  }, [repo, own])
  const shown = web ?? (url?.path === own ? url.url : null)
  if (!shown) return null
  return <img className={className} src={shown} alt="" loading="lazy" decoding="async" />
}
