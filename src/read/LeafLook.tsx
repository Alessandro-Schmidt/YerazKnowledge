// A leaf's cover from its line-2 metadata (ARCHITECTURE.md §7); colours are in colors.ts.

import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { ownPath } from '../model/parse'
import { session } from '../store/session'

/** The cover: an image in the Tree (`/assets/…`, through the blob cache) or on the web. */
export function Cover({
  repo,
  src,
  position = 50,
  ...img
}: {
  repo: string
  src: unknown
  /** Percent from the top, as coverPosition() reads it. */
  position?: number
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
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
  return (
    <img
      alt=""
      loading="lazy"
      decoding="async"
      {...img}
      src={shown}
      style={{ objectPosition: `50% ${position}%` }}
    />
  )
}

/** The address of a leaf's image (its image icon, line 2): a file of the Tree, or https. */
export function imageAt(repo: string, src: string): Promise<string | null> {
  if (/^https:\/\//.test(src)) return Promise.resolve(src)
  const own = ownPath(src)
  return own === null ? Promise.resolve(null) : session.getState().assetUrl(repo, own)
}
