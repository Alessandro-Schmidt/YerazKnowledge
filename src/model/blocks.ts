// GitHub's own block syntax (ARCHITECTURE.md §7, §8), drawn as github.com draws it:
// - an alert is a quote whose first line is only `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
//   `[!WARNING]` or `[!CAUTION]`;
// - a ```mermaid code block is a diagram;
// - `<details>` + `<summary>…</summary>` … `</details>` is a toggle (the read view only).
// Shared by the read view and the editor's live preview. Pure.

export type Callout = 'note' | 'tip' | 'important' | 'warning' | 'caution'

/** The kind of alert a quote's first line (without its `>`) starts, or null. */
export function calloutOf(line: string): Callout | null {
  const m = /^\s*\[!(note|tip|important|warning|caution)\]\s*$/i.exec(line)
  return m ? (m[1]!.toLowerCase() as Callout) : null
}

export const calloutTitle = (kind: Callout) => kind[0]!.toUpperCase() + kind.slice(1)

/** A fenced code block's info string names a Mermaid diagram. */
export const isDiagram = (info: string) => info.trim().split(/\s+/)[0]!.toLowerCase() === 'mermaid'

/** A paragraph that opens a toggle: `<details>`, then optionally `<summary>text</summary>`. */
export function detailsOpen(paragraph: string): { open: boolean; summary: string } | null {
  const m = /^<details(\s+open)?>\s*(?:<summary>([^<]*)<\/summary>)?\s*$/i.exec(paragraph.trim())
  return m ? { open: !!m[1], summary: m[2]?.trim() || 'Details' } : null
}

export const detailsClose = (paragraph: string) => /^<\/details>$/i.test(paragraph.trim())
