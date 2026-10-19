// Brings notes from another app into a new Family (issues #39, #67): an Obsidian vault, a
// Notion export (unzipped, "Markdown & CSV") or any folder of Markdown, converted by
// src/import/convert.ts into a new folder. Open that folder in Yeraz ("Use a folder"), or push
// it to a GitHub repository and add it as a Family.
//   npm run import -- <source folder> <new folder> [--name "My notes"]

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { importNotes } from '../src/import/convert'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' } },
})
const [source, out] = positionals
if (!source || !out) {
  console.error('Usage: npm run import -- <source folder> <new folder> [--name "My notes"]')
  process.exit(1)
}
if (existsSync(out) && readdirSync(out).length) {
  console.error(`${out} isn't empty: give a new folder, so nothing is overwritten.`)
  process.exit(1)
}

const files = new Map<string, Uint8Array>()
for (const entry of readdirSync(source, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue
  const path = join(entry.parentPath, entry.name)
  files.set(relative(source, path).split(sep).join('/'), readFileSync(path))
}

const { files: written, report } = importNotes(files, values.name ?? basename(source))
for (const [path, content] of written) {
  mkdirSync(dirname(join(out, path)), { recursive: true })
  writeFileSync(join(out, path), content)
}
console.log(
  `${out}: ${report.leaves} leaves, ${report.assets} files in assets/, ${report.links} links.`,
)
if (report.unresolved.length)
  console.log(
    `Links to notes not written yet (they show as ghosts): ${[...new Set(report.unresolved)].join(', ')}`,
  )
