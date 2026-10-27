// Graphs for the view layouts' tests: the design's Engineering Family (design/views/screens).

import { designTrees } from '../../../test/fake-github/designFixture'
import { buildGraph, type Graph } from '../../model/graph'
import { parseLeaf } from '../../model/parse'
import { buildTree } from '../../model/tree'

export function graphOf(files: Record<string, string | Uint8Array>, title = 'Family'): Graph {
  const text = Object.fromEntries(
    Object.entries(files).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
  const model = buildTree(
    Object.entries(text).map(([path, t]) => ({
      path,
      type: 'blob' as const,
      sha: path,
      size: t.length,
    })),
  )
  const parsed = new Map(model.leaves.map((p) => [p, parseLeaf(text[p]!)]))
  return buildGraph(model, parsed, title)
}

/** Engineering: Backend, Identity (Keycloak with Realms and Tokens), Cloud, Data… */
export const engineering = (): Graph =>
  graphOf(designTrees().find((t) => t.repo.endsWith('/engineering'))!.files, 'Engineering')

/** Engineering with a root README.md: the Family's text, a leaf that is not a Tree. */
export const engineeringWithText = (): Graph =>
  graphOf(
    {
      ...designTrees().find((t) => t.repo.endsWith('/engineering'))!.files,
      'README.md': '# Engineering\n\nStart at [Keycloak](/Identity/keycloak.md).\n',
    },
    'Engineering',
  )
