import type { GraphNode } from '../model/graph'
import controls from './controls.module.css'

/** Dot = leaf, dot with a ring = leaf with sub-leaves, ring = branch (design legend). */
export function glyphKind(
  node: Pick<GraphNode, 'kind' | 'children'>,
): 'leaf' | 'sprout' | 'branch' | 'root' {
  if (node.kind === 'leaf') return node.children.length ? 'sprout' : 'leaf'
  return node.kind
}

export function Glyph({ node }: { node: Pick<GraphNode, 'kind' | 'children'> }) {
  return <span className={controls.glyph} data-kind={glyphKind(node)} aria-hidden="true" />
}
