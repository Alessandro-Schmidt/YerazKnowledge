// Writes a fixture Tree to disk as real files, to inspect it or push it to a test repository.
//   npm run fixture -- --leaves 1000 --threads 1500 --seed 7 [--out fixtures-out/1000]

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { makeFixture } from '../test/fake-github/fixture'

const { values } = parseArgs({
  options: {
    leaves: { type: 'string', default: '300' },
    threads: { type: 'string' },
    seed: { type: 'string', default: '7' },
    name: { type: 'string' },
    out: { type: 'string' },
  },
})
const leaves = Number(values.leaves)
const fixture = makeFixture({
  leaves,
  threads: Number(values.threads ?? Math.round(leaves * 1.5)),
  seed: Number(values.seed),
  ...(values.name ? { name: values.name } : {}),
})
const out = values.out ?? join('fixtures-out', String(leaves))
for (const [path, text] of Object.entries(fixture.files)) {
  mkdirSync(dirname(join(out, path)), { recursive: true })
  writeFileSync(join(out, path), text)
}
console.log(`${out}: ${JSON.stringify(fixture.stats)}`)
