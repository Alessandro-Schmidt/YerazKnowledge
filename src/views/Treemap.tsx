// Treemap (design/views/screens/04, 13): every leaf a tile as large as its words, grouped by
// Tree; a tile glows with its threads (0 to 3). Tiles are laid out once per size; the
// selection is a data attribute on its tile.

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { compactWords } from '../model/graph'
import ui from '../map/TreeMap.module.css'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import { degree, enterOpens, plural, treeColor, useFirstLines, type ViewProps } from './common'
import { layoutTreemap, type SizeBy } from './layout/treemap'
import styles from './Treemap.module.css'

type GlowBy = 'threads' | 'none'

/** The tint of a tile with `n` threads: the Tree's colour mixed into the raised surface. */
const glow = (n: number) => `${3 + Math.min(n, 3) * 7}%`

export default function Treemap({
  tree,
  graph,
  selected,
  phone,
  insets,
  onSelect,
  onOpen,
}: ViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [sizeBy, setSizeBy] = useState<SizeBy>('words')
  const [glowBy, setGlowBy] = useState<GlowBy>('threads')
  const lines = useFirstLines(tree.repo, graph)

  useLayoutEffect(() => {
    const el = host.current!
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const bottom = phone ? 12 : 74
  const groups = useMemo(
    () =>
      size
        ? layoutTreemap(
            graph,
            { x: 12, y: 12, w: size.w - 24, h: size.h - 12 - bottom },
            sizeBy,
            phone,
          )
        : [],
    [graph, size, sizeBy, phone, bottom],
  )

  // The selection, marked without re-rendering the tiles.
  useLayoutEffect(() => {
    const el = host.current!
    for (const t of el.querySelectorAll('[data-on]')) t.removeAttribute('data-on')
    if (selected !== null)
      el.querySelector(`[data-id="${CSS.escape(selected)}"]`)?.setAttribute('data-on', '')
  })

  const showTip = (event: PointerEvent<HTMLDivElement>) => {
    const el = tip.current!
    const id =
      event.pointerType === 'mouse'
        ? (event.target as Element).closest?.('[data-tile]')?.getAttribute('data-id')
        : null
    const node = id ? graph.nodes.get(id) : undefined
    if (!node) {
      el.hidden = true
      return
    }
    const box = (event.target as Element).closest('[data-tile]')!.getBoundingClientRect()
    const hostBox = host.current!.getBoundingClientRect()
    el.querySelector('strong')!.textContent = node.icon ? `${node.icon} ${node.title}` : node.title
    el.querySelector('span')!.textContent = [
      `${node.words.toLocaleString('en-US')} words`,
      plural(degree(graph, node.id), 'thread'),
      ...(node.children.length ? [plural(node.children.length, 'sub-leaf', 'sub-leaves')] : []),
    ].join(' · ')
    el.style.left = `${Math.min(box.left - hostBox.left + 24, hostBox.width - 280)}px`
    el.style.top = `${Math.min(box.top - hostBox.top + 56, hostBox.height - 120)}px`
    el.hidden = false
  }

  return (
    <div
      className={styles.wrap}
      style={{ right: insets.right ?? 0, bottom: insets.bottom ?? 0 }}
      data-phone={phone || undefined}
    >
      <div
        ref={host}
        className={styles.host}
        onPointerOver={showTip}
        onPointerLeave={() => {
          if (tip.current) tip.current.hidden = true
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null)
        }}
      >
        {groups.map((g) => (
          <section
            key={g.id}
            className={styles.group}
            aria-label={graph.nodes.get(g.id)!.title}
            style={
              {
                left: g.x,
                top: g.y,
                width: g.w,
                height: g.h,
                '--tree': treeColor(tree, g.id),
              } as CSSProperties
            }
          >
            <div className={styles.head}>
              <Glyph node={{ kind: 'branch', children: [] }} />
              <button
                type="button"
                className={`${controls.eyebrow} ${styles.groupName}`}
                onClick={() => onSelect(g.id)}
              >
                {graph.nodes.get(g.id)!.title}
              </button>
              <span className={`${controls.mono} ${styles.groupMeta}`}>
                {g.w > 260 ? `${plural(g.leaves, 'leaf', 'leaves')} · ` : ''}
                {compactWords(g.total)}
              </span>
            </div>
          </section>
        ))}
        {groups.flatMap((g) =>
          g.tiles.map((t) => {
            const n = graph.nodes.get(t.id)!
            const small = t.h < 46 || t.w < 70
            const tiny = t.h < 12 || t.w < 12
            const within = t.within ? graph.nodes.get(t.within)?.title : null
            const first = t.h > 92 && t.w > 170 ? lines.get(t.id) : undefined
            return (
              <button
                key={t.id}
                type="button"
                className={styles.tile}
                data-tile=""
                data-id={t.id}
                data-small={small || undefined}
                tabIndex={tiny ? -1 : undefined}
                aria-hidden={tiny || undefined}
                style={
                  {
                    left: t.x,
                    top: t.y,
                    width: t.w,
                    height: t.h,
                    '--tree': treeColor(tree, g.id),
                    '--glow': glowBy === 'threads' ? glow(degree(graph, t.id)) : '3%',
                  } as CSSProperties
                }
                onClick={() => onSelect(t.id)}
                onDoubleClick={() => onOpen(t.id)}
                onKeyDown={enterOpens(selected === t.id, () => onOpen(t.id))}
              >
                <span className={styles.title}>
                  {n.icon ? `${n.icon} ` : ''}
                  {n.title}
                </span>
                {t.h > 30 && (
                  <span className={`${controls.mono} ${styles.meta}`}>
                    {compactWords(n.words)}
                    {within && t.w > 110 ? ` · in ${within}` : ''}
                  </span>
                )}
                {first && <span className={`reading ${styles.first}`}>{first}</span>}
              </button>
            )
          }),
        )}
        <div ref={tip} className={ui.tip} hidden>
          <strong />
          <span />
          <em>Click to peek · double-click to open</em>
        </div>
      </div>
      {!phone && (
        <div className={styles.bottom}>
          <div className={`${controls.panel} ${styles.legend}`}>
            <span>
              <span className={styles.areaBig} />
              <span className={styles.areaSmall} />
              Area: {sizeBy === 'words' ? 'words written' : 'one per leaf'}
            </span>
            {glowBy === 'threads' && (
              <span>
                {[0, 1, 2, 3].map((d) => (
                  <span
                    key={d}
                    className={styles.swatch}
                    style={{ '--glow': glow(d) } as CSSProperties}
                  />
                ))}
                Glow: threads, 0 to 3
              </span>
            )}
          </div>
          <span className={styles.grow} />
          <div className={`${controls.panel} ${styles.pickers}`}>
            <Picker
              label="Size by"
              value={sizeBy}
              options={{ words: 'Words', equal: 'Equal' }}
              onChange={(v) => setSizeBy(v as SizeBy)}
            />
            <Picker
              label="Glow by"
              value={glowBy}
              options={{ threads: 'Threads', none: 'Nothing' }}
              onChange={(v) => setGlowBy(v as GlowBy)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Record<string, string>
  onChange(value: string): void
}) {
  return (
    <label className={styles.picker}>
      <span>{label}</span>
      <span className={styles.select}>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {Object.entries(options).map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={13} />
      </span>
    </label>
  )
}
