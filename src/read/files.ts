// A file kept in the Tree (`assets/…`) without a player: a card with its name, type and
// size that downloads it. Shared by the read view and the editor's live preview. The file
// is fetched only when the card is used, so a leaf with large attachments opens fast.

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
/** HTML-escapes text for an attribute or element. */
export const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ENTITIES[c]!)

/** `1.2 MB`, `350 KB`, `12 bytes`: one decimal under 10, whole numbers above. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}\u00a0${n === 1 ? 'byte' : 'bytes'}`
  const units = ['KB', 'MB', 'GB']
  let value = n / 1024
  let unit = 0
  for (; value >= 1024 && unit < units.length - 1; unit++) value /= 1024
  const shown = value < 10 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value))
  return `${shown}\u00a0${units[unit]}`
}

/** The extension in capitals (`XLSX`), or `File` without one. */
export const fileType = (path: string) =>
  /[^/]\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toUpperCase() ?? 'File'

/** The card's HTML: the link's text, the file's name when it differs, then type and size. */
export function fileCardHtml(file: { path: string; title: string }, size: number | null): string {
  const name = file.path.replace(/^.*\//, '')
  const title = file.title || name
  const about = [fileType(file.path), ...(size === null ? [] : [formatBytes(size)])].join(' · ')
  return (
    `<button type="button" class="file-card" data-asset-file="${escape(file.path)}" ` +
    `aria-label="${escape(`Download ${title}, ${about}`)}"><strong>${escape(title)}</strong>` +
    `${title === name ? '' : `<span>${escape(name)}</span>`}<em>${escape(about)}</em></button>`
  )
}

/** Saves a file of the Tree to this device, under its name in the repository. */
export async function downloadAsset(
  path: string,
  url: (path: string) => Promise<string | null>,
): Promise<void> {
  const href = await url(path)
  if (!href) return
  const a = document.createElement('a')
  a.href = href
  a.download = path.replace(/^.*\//, '')
  a.click()
}
