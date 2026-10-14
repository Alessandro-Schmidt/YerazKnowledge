import { describe, expect, it } from 'vitest'
import { makeFixture, slugify } from './fixture'

const LINK = /\[([^\]]*)\]\((\/[^)]+)\)/g

describe('makeFixture', () => {
  it('is deterministic for a seed, and differs between seeds', () => {
    const a = makeFixture({ leaves: 100, threads: 150, seed: 7 })
    expect(makeFixture({ leaves: 100, threads: 150, seed: 7 })).toEqual(a)
    expect(makeFixture({ leaves: 100, threads: 150, seed: 8 }).files).not.toEqual(a.files)
  })

  it.each([100, 1000, 5000])('builds %i leaves that follow the repository format', (leaves) => {
    const { files, stats } = makeFixture({ leaves, threads: Math.round(leaves * 1.5), seed: 7 })
    const md = Object.keys(files).filter((p) => p.endsWith('.md'))
    expect(md).toHaveLength(leaves)
    expect(stats.leaves).toBe(leaves)
    expect(stats.threads).toBe(Math.round(leaves * 1.5))
    expect(stats.maxDepth).toBeGreaterThanOrEqual(3)
    expect(stats.maxDepth).toBeLessThanOrEqual(4)
    expect(JSON.parse(files['.yeraz.json']!)).toMatchObject({ name: `Fixture ${leaves}` })

    const paths = new Set(md)
    let links = 0
    for (const path of md) {
      const text = files[path]!
      expect(text.split('\n')[0], path).toMatch(/^# \S/)
      expect(path.split('/').length, path).toBeLessThanOrEqual(4)
      const prose = text.replace(/```[\s\S]*?```/g, '')
      for (const [, , target] of prose.matchAll(LINK)) {
        expect(paths.has(target!.slice(1)), `${path} → ${target}`).toBe(true)
        links++
      }
    }
    expect(links).toBe(stats.threads)
  })

  it('makes some leaves parents (sibling folder) and keeps branches non-empty', () => {
    const { files } = makeFixture({ leaves: 300, threads: 450, seed: 7 })
    const md = Object.keys(files).filter((p) => p.endsWith('.md'))
    const folders = new Set(
      md.flatMap((p) =>
        p
          .split('/')
          .slice(0, -1)
          .map((_, i, parts) => parts.slice(0, i + 1).join('/')),
      ),
    )
    const leafParents = [...folders].filter((f) => files[`${f}.md`] !== undefined)
    const branches = [...folders].filter((f) => files[`${f}.md`] === undefined)
    expect(leafParents.length).toBeGreaterThan(10)
    expect(branches.length).toBeGreaterThan(5)
  })

  it('includes emoji icons, metadata lines and links inside code', () => {
    const texts = Object.values(makeFixture({ leaves: 300, threads: 450, seed: 7 }).files)
    expect(texts.some((t) => /^# \p{Extended_Pictographic}/u.test(t))).toBe(true)
    expect(texts.some((t) => t.split('\n')[1]?.startsWith('<!-- yeraz {'))).toBe(true)
    expect(texts.some((t) => t.includes('[not a thread](/nowhere.md)'))).toBe(true)
  })

  it('has an uneven spread of words, like a real knowledge base', () => {
    const { files } = makeFixture({ leaves: 1000, threads: 1500, seed: 7 })
    const words = Object.values(files)
      .map((t) => t.split(/\s+/).length)
      .sort((a, b) => a - b)
    const median = words[Math.floor(words.length / 2)]!
    expect(words.at(-1)!).toBeGreaterThan(median * 8)
  })
})

describe('slugify', () => {
  it('makes file-safe names', () => {
    expect(slugify('Keycloak (IdP)')).toBe('keycloak-idp')
    expect(slugify('Ação Rápida')).toBe('acao-rapida')
    expect(slugify('🔐')).toBe('untitled')
  })
})
