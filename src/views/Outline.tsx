// Outline (design/views/screens/02, 11): the Family read like a table of contents. Each Tree is
// a heading row with its share of the largest Tree; under it every branch and leaf with
// its first line, thread count and words. The rail lists the most connected leaves and
// where you write most. Selection is a data attribute on the rows, not a re-render.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { compactWords, type Graph, type GraphNode } from '../model/graph'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import {
  degree,
  leavesUnder,
  placeOf,
  plural,
  topOf,
  treeColor,
  trees,
  useFirstLines,
  type ViewProps,
} from './common'
import styles from './Outline.module.css'
import { ThreadIcon } from './parts'

type Order = 'tree' | 'words' | 'threads' | 'name'
const ORDERS: Record<Order, string> = {
  tree: 'Tree order',
  words: 'Most words',
  threads: 'Most threads',
  name: 'A to Z',
}

/** The ids open at first: every Tree, and the way down to the selection. */
function initialOpen(graph: Graph, selected: string | null): Set<string> {
  const open = new Set(trees(graph).map((t) => t.id))
  for (let id = selected; id; id = graph.nodes.get(id)?.parent ?? null) open.add(id)
  return open
}

export default function Outline({
  tree,
  graph,
  selected,
  phone,
  insets,
  onSelect,
  onOpen,
}: ViewProps) {
  const [open, setOpen] = useState(() => initialOpen(graph, selected))
  const [firstLines, setFirstLines] = useState(true)
  const [words, setWords] = useState(true)
  const [order, setOrder] = useState<Order>('tree')
  const lines = useFirstLines(tree.repo, graph)
  const list = useRef<HTMLUListElement>(null)

  const sort = useMemo(() => {
    const by: Record<Order, (a: GraphNode, b: GraphNode) => number> = {
      tree: () => 0,
      words: (a, b) => b.total - a.total,
      threads: (a, b) => degree(graph, b.id) - degree(graph, a.id),
      name: (a, b) => a.title.localeCompare(b.title),
    }
    return (ids: readonly string[]) =>
      ids
        .map((id) => graph.nodes.get(id))
        .filter((n): n is GraphNode => n !== undefined)
        .sort(by[order])
  }, [graph, order])

  const tops = sort(trees(graph).map((t) => t.id))
  const largest = Math.max(1, ...tops.map((t) => t.total))

  // Rows, flattened: a closed node hides everything under it.
  const rows: { node: GraphNode; level: number; top: string }[] = []
  const walk = (node: GraphNode, level: number, top: string) => {
    rows.push({ node, level, top })
    if (open.has(node.id)) for (const c of sort(node.children)) walk(c, level + 1, top)
  }
  for (const t of tops) walk(t, 1, t.id)

  // The selection, marked without re-rendering the rows, and scrolled to.
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    for (const row of el.querySelectorAll('[data-on]')) row.removeAttribute('data-on')
    if (selected === null) return
    const row = el.querySelector(`[data-id="${CSS.escape(selected)}"]`)
    row?.setAttribute('data-on', '')
    row?.scrollIntoView?.({ block: 'nearest' })
  })

  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const root = graph.nodes.get('')!
  const most = [...graph.nodes.values()]
    .filter((n) => n.kind === 'leaf' && degree(graph, n.id) > 0)
    .sort((a, b) => degree(graph, b.id) - degree(graph, a.id) || a.title.localeCompare(b.title))
    .slice(0, 6)
  const byTotal = [...tops].sort((a, b) => b.total - a.total).slice(0, 8)

  return (
    <div
      className={styles.wrap}
      data-phone={phone || undefined}
      style={{ right: insets.right ?? 0, bottom: insets.bottom ?? 0 }}
    >
      <div className={styles.page}>
        <div className={styles.column}>
          <p className={styles.where}>
            <span className={controls.eyebrow}>Family</span>
            <span className={controls.mono}>
              {tree.folder !== undefined
                ? `This device · ${tree.folder}`
                : `github.com/${tree.repo} · ${tree.branch}`}
            </span>
          </p>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{root.title}</h1>
            {phone && (
              <span className={`${controls.mono} ${styles.small}`}>
                {compactWords(root.total)} words
              </span>
            )}
          </div>
          {!phone && (
            <div className={styles.chips}>
              {[
                plural(graph.stats.leaves, 'leaf', 'leaves'),
                plural(tops.length, 'tree'),
                plural(graph.stats.threads, 'thread'),
                `${compactWords(graph.stats.words)} words`,
              ].map((c) => (
                <span key={c} className={`${controls.mono} ${styles.chip}`}>
                  {c}
                </span>
              ))}
            </div>
          )}
          <div className={styles.tools}>
            <button
              type="button"
              className={styles.tool}
              onClick={() =>
                setOpen(
                  new Set(
                    [...graph.nodes.values()].filter((n) => n.children.length).map((n) => n.id),
                  ),
                )
              }
            >
              Expand all
            </button>
            <button type="button" className={styles.tool} onClick={() => setOpen(new Set())}>
              Collapse all
            </button>
            <span className={styles.grow} />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={firstLines}
                onChange={(e) => setFirstLines(e.target.checked)}
              />
              First lines
            </label>
            {!phone && (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={words}
                  onChange={(e) => setWords(e.target.checked)}
                />
                Word counts
              </label>
            )}
            <span className={styles.sep} aria-hidden="true" />
            <label className={styles.order}>
              <span className={controls.visuallyHidden}>Order</span>
              <select value={order} onChange={(e) => setOrder(e.target.value as Order)}>
                {(Object.keys(ORDERS) as Order[]).map((o) => (
                  <option key={o} value={o}>
                    {ORDERS[o]}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={13} />
            </label>
          </div>

          <ul ref={list} className={styles.rows} aria-label={`${root.title} outline`}>
            {rows.map(({ node, level, top }) => {
              const style = { '--tree': treeColor(tree, top) } as CSSProperties
              const chevron = node.children.length ? (
                <button
                  type="button"
                  className={styles.chev}
                  aria-label={`${open.has(node.id) ? 'Collapse' : 'Expand'} ${node.title}`}
                  aria-expanded={open.has(node.id)}
                  onClick={() => toggle(node.id)}
                >
                  <Icon name="chevronRight" size={13} />
                </button>
              ) : (
                <span className={styles.chevSpace} />
              )
              if (level === 1) {
                const count = leavesUnder(graph, node.id).length + (node.kind === 'leaf' ? 1 : 0)
                return (
                  <li key={node.id} className={styles.treeRow} data-id={node.id} style={style}>
                    {chevron}
                    <Glyph node={{ kind: 'branch', children: node.children }} />
                    <button
                      type="button"
                      className={styles.treeName}
                      onClick={() => onSelect(node.id)}
                      onDoubleClick={() => onOpen(node.id)}
                    >
                      {node.icon && <span aria-hidden="true">{node.icon} </span>}
                      {node.title}
                    </button>
                    <span className={`${controls.mono} ${styles.small}`}>
                      {phone ? count : plural(count, 'leaf', 'leaves')}
                    </span>
                    <span className={styles.grow} />
                    <span className={styles.share} aria-hidden="true">
                      <span style={{ width: `${(node.total / largest) * 100}%` }} />
                    </span>
                    <span className={`${controls.mono} ${styles.total}`}>
                      {compactWords(node.total)}
                    </span>
                  </li>
                )
              }
              const threads = degree(graph, node.id)
              const first = node.kind === 'leaf' ? lines.get(node.id) : undefined
              return (
                <li
                  key={node.id}
                  className={styles.row}
                  data-id={node.id}
                  data-level={Math.min(level, 6)}
                  style={{ ...style, '--level': level - 2 } as CSSProperties}
                >
                  <div className={styles.line}>
                    {chevron}
                    <Glyph node={node} />
                    <button
                      type="button"
                      className={styles.name}
                      onClick={() => onSelect(node.id)}
                      onDoubleClick={() => onOpen(node.id)}
                    >
                      {node.icon && <span aria-hidden="true">{node.icon} </span>}
                      {node.title}
                    </button>
                    {!phone && (
                      <span className={`reading ${styles.first}`}>{firstLines ? first : ''}</span>
                    )}
                    {phone && <span className={styles.grow} />}
                    <span className={`${controls.mono} ${styles.threads}`}>
                      {threads > 0 && (
                        <>
                          <ThreadIcon />
                          {threads}
                        </>
                      )}
                    </span>
                    {(words || phone) && (
                      <span className={`${controls.mono} ${styles.words}`}>
                        {node.kind === 'leaf' ? compactWords(node.words) : ''}
                      </span>
                    )}
                  </div>
                  {phone && firstLines && first && (
                    <span className={`reading ${styles.firstBelow}`}>{first}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {!phone && (
        <aside className={styles.rail} aria-label="About this Family">
          {most.length > 0 && (
            <section className={styles.most}>
              <h2 className={controls.eyebrow}>Most connected</h2>
              {most.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={styles.mostRow}
                  aria-current={n.id === selected || undefined}
                  style={{ '--tree': treeColor(tree, topOf(graph, n.id)) } as CSSProperties}
                  onClick={() => onSelect(n.id)}
                >
                  <Glyph node={n} />
                  <span className={styles.mostText}>
                    <span>{n.title}</span>
                    <span className={controls.mono}>{placeOf(graph, n.id)}</span>
                  </span>
                  <span className={`${controls.mono} ${styles.mostCount}`}>
                    <ThreadIcon />
                    {degree(graph, n.id)}
                  </span>
                </button>
              ))}
            </section>
          )}
          <section className={styles.bars}>
            <h2 className={controls.eyebrow}>Where you write most</h2>
            {byTotal.map((t) => (
              <div
                key={t.id}
                className={styles.bar}
                style={{ '--tree': treeColor(tree, t.id) } as CSSProperties}
              >
                <div className={styles.barLabel}>
                  <span>{t.title}</span>
                  <span className={controls.mono}>{compactWords(t.total)}</span>
                </div>
                <div className={styles.track}>
                  <div style={{ width: `${(t.total / largest) * 100}%` }} />
                </div>
              </div>
            ))}
          </section>
        </aside>
      )}
    </div>
  )
}
