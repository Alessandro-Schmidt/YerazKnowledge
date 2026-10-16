// Images and other attachments in `assets/` (ARCHITECTURE.md §4, §8). They are fetched by
// blob SHA, once, and kept on this device like leaf texts: a SHA never changes meaning.

import type { GitHubClient } from '../github/client'
import { slugify } from '../model/slug'
import type { KeyValueStore } from '../store/db'

export async function assetBytes(
  repo: string,
  sha: string,
  deps: { client: GitHubClient; store: KeyValueStore },
): Promise<Uint8Array> {
  const cached = await deps.store.get<Uint8Array>(`asset:${sha}`)
  if (cached) return cached
  const bytes = await deps.client.getBlob(repo, sha)
  await deps.store.set(`asset:${sha}`, bytes)
  return bytes
}

/** `assets/2026-10-14-realm-diagram.png`: the local date, then the file's name as a slug. `ext` may be empty. */
export function assetPath(
  fileName: string,
  ext: string,
  date: Date,
  taken: (path: string) => boolean,
): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')
  const base = `assets/${day}-${slugify(fileName.replace(/\.[^.]*$/, '') || 'image')}`
  const dot = ext ? `.${ext}` : ''
  let path = `${base}${dot}`
  for (let n = 2; taken(path); n++) path = `${base}-${n}${dot}`
  return path
}

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  vtt: 'text/vtt',
}

export const mimeOf = (path: string) =>
  TYPES[/\.([^./]+)$/.exec(path)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream'
