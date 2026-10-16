// Files people add to a leaf, picked, pasted or dropped (ARCHITECTURE.md §4, §8). Each goes
// into assets/, named by date and slug, and is committed with the leaf that links to it.
// Images are shown where they are; any other file is a paragraph of one plain link, which
// the app shows as a card and GitHub as a link.

import { destination } from '../model/links'
import { assetPath } from '../sync/assets'

/** Files above this get a warning before they are committed (ARCHITECTURE.md §11). */
export const WARN_BYTES = 10 * 1024 * 1024
/** GitHub refuses files over 100 MB. */
export const MAX_BYTES = 100 * 1024 * 1024

/** `Q3 Report.XLSX` → `xlsx`; empty when the name has none (`Makefile`, `.env`). */
export const extensionOf = (name: string) =>
  /[^/]\.([A-Za-z0-9]{1,16})$/.exec(name)?.[1]?.toLowerCase() ?? ''

/** What the page provides: the Tree's paths, saving a pending file, and asking or telling the person. */
export interface AttachHost {
  taken(path: string): boolean
  save(path: string, bytes: Uint8Array): Promise<void>
  ask(message: string): boolean
  tell(message: string): void
}

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

/** Saves a file in assets/ as a pending edit; null when it was refused or declined. */
export async function attach(
  file: File,
  host: AttachHost,
): Promise<{ path: string; image: boolean } | null> {
  const tooLarge = (bytes: number) => {
    if (bytes <= MAX_BYTES) return false
    host.tell(
      `${file.name} is ${megabytes(bytes)} MB. GitHub doesn't accept files over 100 MB, so it can't be added to the Tree.`,
    )
    return true
  }
  // An image may be scaled down below the limit; any other file is refused before it is read.
  const image = file.type.startsWith('image/')
  if (!image && tooLarge(file.size)) return null
  const prepared = (image && (await asImage(file))) || {
    bytes: new Uint8Array(await file.arrayBuffer()),
    ext: extensionOf(file.name),
    image: false,
  }
  const size = prepared.bytes.byteLength
  if (tooLarge(size)) return null
  if (
    size > WARN_BYTES &&
    !host.ask(
      `${file.name} is ${megabytes(size)} MB. Large files make the repository slow to download. Add it anyway?`,
    )
  )
    return null
  const path = assetPath(file.name, prepared.ext, new Date(), host.taken)
  await host.save(path, prepared.bytes)
  return { path, image: prepared.image }
}

/** An image as it will be committed (images.ts); null for a format this browser can't draw. */
async function asImage(file: File) {
  try {
    const { prepareImage } = await import('./images')
    return { ...(await prepareImage(file)), image: true }
  } catch {
    return null
  }
}

/** The Markdown for an added file: an image where it is, any other file as a paragraph of one link. */
export function attachmentMarkdown(name: string, path: string, image: boolean): string {
  if (image) {
    const alt = name.replace(/\.[^.]*$/, '').replace(/[[\]\\]/g, '') || 'Image'
    return `![${alt}](${destination(path)})`
  }
  return `\n[${name.replace(/[[\]\\]/g, '\\$&')}](${destination(path)})\n`
}
