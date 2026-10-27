// A template for new leaves (issue #41): a `.md` file in `.yeraz/templates/`, kept in the
// Family like any note, so every device and everyone sharing the repository (or folder) has
// it. Its line 1 is its name, and the emoji there is the icon a new leaf gets; its line 2 is
// the look (cover, colours) the leaf gets; the rest is what the leaf starts with, where
// `{{title}}`, `{{date}}` and `{{tree}}` are filled in. Pure.

import { HEADING, leadingIcon, parseMeta, stripBom, withMeta, type LeafMeta } from './parse'

/** What a template's variables are filled with. */
export interface TemplateFill {
  /** The title typed for the new leaf. */
  title: string
  date: Date
  /** The Tree the leaf is made in (the new leaf's own title when it is a Tree of its own). */
  tree: string
}

export const VARIABLES = ['title', 'date', 'tree'] as const
const VARIABLE = /\{\{\s*(title|date|tree)\s*\}\}/g

/** `2026-10-27`: the date as the person's calendar has it, not UTC's. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The template's parts: its name line, its look and the body new leaves start with. */
export function splitTemplate(template: string): {
  icon: string
  meta: LeafMeta | null
  body: string
} {
  const lines = stripBom(template).split(/\r\n|\r|\n/)
  const heading = HEADING.exec(lines[0] ?? '')
  const meta = heading ? parseMeta(lines[1]) : null
  const body = heading ? lines.slice(meta ? 2 : 1) : lines
  return { icon: heading ? leadingIcon(heading[1] ?? '') : '', meta, body: body.join('\n') }
}

/**
 * A new leaf's text from a template: titled as typed (the template's emoji before it, unless
 * the title brings its own), with the template's look, and its body with the variables filled.
 */
export function fillTemplate(template: string, fill: TemplateFill): string {
  const { icon, meta, body } = splitTemplate(template)
  const title = fill.title.replace(/\s+/g, ' ').trim() || 'Untitled'
  const values = { title, date: isoDate(fill.date), tree: fill.tree }
  const filled = body.replace(VARIABLE, (_, name: keyof typeof values) => values[name])
  const own = leadingIcon(title) ? '' : icon
  const rest = filled.replace(/^\s*\n/, '').replace(/\s+$/, '')
  const text = `# ${own ? `${own} ` : ''}${title}\n\n${rest ? `${rest}\n` : ''}`
  // A template hidden from the map stays hidden; the leaves made from it don't.
  const look = meta && Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'hidden'))
  return withMeta(text, look)
}
