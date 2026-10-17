// The Explorer: the file view of a Family, each of its Trees a top-level group, and the
// keyboard route to every leaf (role="tree", arrow keys; development-plan.md §7.3).
// Branches start collapsed below the Trees; the selection's ancestors open by themselves.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { TreeRef } from '../github/graphql'
import { compactWords, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import controls from './controls.module.css'
import styles from './Explorer.module.css'
import { Glyph } from './Glyph'
import { Icon } from './icons'
import { parentFor, type StructureAction } from './StructureDialogs'

interface Row {
  id: string
  depth: number
  open: boolean
  hasChildren: boolean
  index: number
  of: number
}

export function Explorer({
  tree,
  graph,
  selected,
  onSelect,
  onClose,
  onAction,
}: {
  tree: TreeRef
  graph: Graph
  selected: string | null
  onSelect(id: string): void
  onClose(): void
  onAction(action: StructureAction): void
}) {
  const parent = parentFor(graph, selected)
  const [open, setOpen] = useState(
    () =>
      new Set(
        graph.nodes.get(ROOT)!.children.filter((id) => graph.nodes.get(id)!.kind === 'branch'),
      ),
  )
  const [focus, setFocus] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Open the selection's ancestors when the selection changes (adjusting state while rendering).
  const [seen, setSeen] = useState<string | null>(null)
  if (seen !== selected) {
    setSeen(selected)
    if (selected !== null && graph.nodes.has(selected)) {
      const next = new Set(open)
      for (
        let p = graph.nodes.get(selected)!.parent;
        p !== null && p !== ROOT;
        p = graph.nodes.get(p)!.parent
      )
        next.add(p)
      if (next.size !== open.size) setOpen(next)
    }
  }

  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (id: string) => {
      const children = graph.nodes.get(id)!.children
      children.forEach((child, i) => {
        const node = graph.nodes.get(child)!
        const isOpen = open.has(child)
        out.push({
          id: child,
          depth: node.depth,
          open: isOpen,
          hasChildren: node.children.length > 0,
          index: i + 1,
          of: children.length,
        })
        if (isOpen) walk(child)
      })
    }
    walk(ROOT)
    return out
  }, [graph, open])

  const current =
    focus !== null && rows.some((r) => r.id === focus) ? focus : (selected ?? rows[0]?.id ?? null)

  // Keep the selected row in view when it changes from the map.
  useEffect(() => {
    if (selected === null) return
    listRef.current
      ?.querySelector(`[data-row="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected, rows])

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const move = (id: string | undefined) => {
    if (id === undefined) return
    setFocus(id)
    listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const at = rows.findIndex((r) => r.id === current)
    const row = rows[at]
    if (!row) return
    const node = graph.nodes.get(row.id)!
    const handled = (() => {
      switch (event.key) {
        case 'ArrowDown':
          return (move(rows[at + 1]?.id), true)
        case 'ArrowUp':
          return (move(rows[at - 1]?.id), true)
        case 'Home':
          return (move(rows[0]?.id), true)
        case 'End':
          return (move(rows.at(-1)?.id), true)
        case 'ArrowRight':
          if (row.hasChildren && !row.open) toggle(row.id)
          else if (row.hasChildren) move(node.children[0])
          return true
        case 'ArrowLeft':
          if (row.open) toggle(row.id)
          else if (node.parent !== null && node.parent !== ROOT) move(node.parent)
          return true
        case 'Enter':
        case ' ':
          return (onSelect(row.id), true)
        default:
          return false
      }
    })()
    if (handled) event.preventDefault()
  }

  return (
    <aside className={styles.explorer} aria-label="Explorer">
      <div className={styles.head}>
        <h2 className={controls.eyebrow}>Explorer</h2>
        <button
          type="button"
          className={controls.iconButton}
          aria-label="Hide explorer"
          onClick={onClose}
        >
          <Icon name="chevronLeft" />
        </button>
      </div>
      <div className={styles.tree}>
        <span className={styles.name}>{tree.title}</span>
        <span className={`${controls.mono} ${styles.repo}`}>
          {tree.repo} · {tree.branch}
        </span>
      </div>
      <div className={styles.scroll}>
        <div
          ref={listRef}
          role="tree"
          aria-label="Branches and leaves"
          className={styles.rows}
          onKeyDown={onKeyDown}
        >
          {rows.map((row) => {
            const node = graph.nodes.get(row.id)!
            const isSelected = row.id === selected
            return (
              <div
                key={row.id}
                role="treeitem"
                data-row={row.id}
                aria-level={row.depth}
                aria-setsize={row.of}
                aria-posinset={row.index}
                aria-expanded={row.hasChildren ? row.open : undefined}
                aria-selected={isSelected}
                tabIndex={row.id === current ? 0 : -1}
                className={styles.row}
                style={{ paddingLeft: 6 + (row.depth - 1) * 16 }}
                onFocus={() => setFocus(row.id)}
                onClick={() => onSelect(row.id)}
              >
                <span
                  className={styles.chevron}
                  data-open={row.open || undefined}
                  data-none={!row.hasChildren || undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(row.id)
                  }}
                  aria-hidden="true"
                >
                  <Icon name="chevronRight" size={13} />
                </span>
                <Glyph node={node} />
                <span className={styles.label}>
                  {node.icon ? `${node.icon} ` : ''}
                  {node.title}
                </span>
                <span className={`${controls.mono} ${styles.count}`}>
                  {compactWords(node.total)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className={styles.foot}>
        <button
          type="button"
          className={controls.ghost}
          onClick={() => onAction({ kind: 'new-branch', parent })}
        >
          <span className={controls.glyph} data-kind="branch" aria-hidden="true" />
          {parent === ROOT ? 'New tree' : 'New branch'}
        </button>
        <button
          type="button"
          className={controls.ghost}
          onClick={() => onAction({ kind: 'new-leaf', parent })}
        >
          <span className={controls.glyph} data-kind="leaf" aria-hidden="true" />
          New leaf
        </button>
      </div>
    </aside>
  )
}
