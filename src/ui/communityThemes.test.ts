import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTheme, resolveCustom } from './customTheme'

// themes/ accepts contributions by pull request (development-plan.md, After launch).
const dir = join(import.meta.dirname, '../../themes')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('community themes', () => {
  it('there are some', () => expect(files.length).toBeGreaterThan(0))

  it.each(files)('%s is a theme, readable as written', (file) => {
    const theme = parseTheme(readFileSync(join(dir, file), 'utf8'))
    expect(resolveCustom(theme).adjusted).toEqual([])
  })
})
