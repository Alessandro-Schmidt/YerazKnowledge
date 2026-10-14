import { describe, expect, it } from 'vitest'
import { buildGraph } from '../../src/model/graph'
import { parseLeaf } from '../../src/model/parse'
import { buildTree } from '../../src/model/tree'
import { designTrees } from './designFixture'

const graphOf = (files: Record<string, string>, title: string) => {
  const model = buildTree(
    Object.entries(files).map(([path, text]) => ({
      path,
      type: 'blob' as const,
      sha: path,
      size: text.length,
    })),
  )
  return buildGraph(model, new Map(model.leaves.map((p) => [p, parseLeaf(files[p]!)])), title)
}

describe('designTrees', () => {
  const [engineering, art, languages, music] = designTrees()

  it('rebuilds the designed Engineering tree: 30 leaves, 40.5k words, the designed threads', () => {
    const g = graphOf(engineering!.files, 'Engineering')
    // The design lists 17 threads, but Keycloak's text (screen 03) also mentions OpenID
    // Connect and Spring Security, and every mention is a thread.
    expect(g.stats).toMatchObject({ leaves: 30, branches: 7 })
    expect(g.out.get('Identity/keycloak.md')!.sort()).toEqual([
      'Backend/spring-boot/spring-security.md',
      'Identity/oauth-2-0.md',
      'Identity/openid-connect.md',
    ])
    expect(Math.round(g.stats.words / 100) / 10).toBe(40.5)
    expect(g.nodes.get('Identity/keycloak.md')).toMatchObject({
      title: 'Keycloak',
      icon: '🔐',
      words: 2600,
    })
    expect(g.nodes.get('Identity/keycloak.md')!.children).toEqual([
      'Identity/keycloak/realms.md',
      'Identity/keycloak/tokens.md',
    ])
    expect(g.in.get('Identity/oauth-2-0.md')).toHaveLength(3)
  })

  it('rebuilds the three smaller Trees with the designed leaf counts', () => {
    expect(graphOf(art!.files, 'Art History').stats.leaves).toBe(34)
    expect(graphOf(languages!.files, 'Languages').stats.leaves).toBe(22)
    expect(graphOf(music!.files, 'Music Theory').stats.leaves).toBe(15)
    expect(JSON.parse(art!.files['.yeraz.json']!)).toEqual({ name: 'Art History', color: 'amber' })
  })
})
