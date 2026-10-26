export interface ImportOptions {
  name?: string
  /** A page's emoji by its path, new or as in the source. */
  emojis?: Record<string, string>
  defaultEmoji?: string
  /** False leaves titles without an emoji. */
  emoji?: boolean
  color?: string
}
export interface Page {
  path: string
  source: string
  title: string
  emoji: string | null
  /** The emoji is the script's guess (or the default), not from the title or `emojis`. */
  suggested: boolean
  excerpt: string
}
export interface Imported {
  files: Map<string, string | Uint8Array>
  report: { leaves: number; assets: number; links: number; unresolved: string[]; skipped: string[] }
  pages: Page[]
}
export function importNotes(
  source: ReadonlyMap<string, Uint8Array | string>,
  options?: ImportOptions,
): Imported
export function suggestEmoji(title: string, folders?: string[], text?: string): string | null
export function leadingIcon(text: string): string
export function slugify(title: string): string
export function logseqToMarkdown(
  text: string,
): { text: string; title: string | null; properties: string | null } | null
export function htmlToMarkdown(
  source: string,
  fallbackTitle: string,
  keepImage: (hint: string, ext: string, bytes: Uint8Array) => string,
): { title: string; text: string }
