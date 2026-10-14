// The Peek: a partial view of the selected node, floating over the map (420 px), or the
// full read page when expanded (760 px column). On phones it is a bottom sheet.

import { useEffect, useLayoutEffect, useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { compactWords, crumbs, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { mark } from '../perf'
import { readBlob } from '../store/session'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import styles from './Peek.module.css'
import { renderLeaf } from './render'

export interface PeekProps {
  tree: TreeRef
  graph: Graph
  id: string
  expanded: boolean
  href(id: string): string
  onSelect(id: string): void
  onExpand(expanded: boolean): void
  onClose(): void
}

export function Peek({ tree, graph, id, expanded, href, onSelect, onExpand, onClose }: PeekProps) {
  useLayoutEffect(() => mark('peek-painted'), [id])
  const node = graph.nodes.get(id)!
  const kind = node.kind === 'root' ? 'Tree' : node.kind === 'branch' ? 'Branch' : 'Leaf'
  const out = graph.out.get(id) ?? []
  const into = graph.in.get(id) ?? []
  const crumb =
    node.kind === 'root'
      ? `github.com/${tree.repo}`
      : [graph.nodes.get(ROOT)!.title, ...crumbs(graph, id)].join(' / ')
  const path =
    node.kind === 'root' ? `${tree.repo} @ ${tree.branch}` : node.kind === 'branch' ? `${id}/` : id
  const cover =
    typeof node.meta?.cover === 'string' && /^https:\/\//.test(node.meta.cover)
      ? node.meta.cover
      : null

  const chips =
    node.kind === 'root'
      ? [
          count(graph.stats.leaves, 'leaf', 'leaves'),
          count(graph.stats.branches, 'branch', 'branches'),
          count(graph.stats.threads, 'thread'),
          `${compactWords(graph.stats.words)} words`,
        ]
      : node.kind === 'branch'
        ? [count(node.children.length, 'item'), `${compactWords(node.total)} words inside`]
        : [
            `${node.words.toLocaleString('en-US')} words`,
            ...(node.children.length
              ? [count(node.children.length, 'sub-leaf', 'sub-leaves')]
              : []),
            count(out.length + into.length, 'thread'),
          ]

  const named = (target: string) => {
    const n = graph.nodes.get(target)!
    return `${n.icon ? `${n.icon} ` : ''}${n.title}`
  }
  const where = (target: string) =>
    [graph.nodes.get(ROOT)!.title, ...crumbs(graph, target)].join(' / ')

  return (
    <section
      className={styles.peek}
      data-expanded={expanded || undefined}
      aria-label={`${kind} preview`}
    >
      <span className={styles.handle} aria-hidden="true" />
      <div className={styles.head}>
        <span className={styles.kind}>{kind}</span>
        <span className={`${controls.mono} ${styles.crumb}`}>{crumb}</span>
        <button
          type="button"
          className={controls.iconButton}
          aria-label={expanded ? 'Back to the map' : 'Open full page'}
          onClick={() => onExpand(!expanded)}
        >
          <Icon name={expanded ? 'collapse' : 'expand'} />
        </button>
        <button
          type="button"
          className={controls.iconButton}
          aria-label="Dismiss"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className={styles.scroll}>
        <div className={styles.column}>
          {cover && (
            <img className={styles.cover} src={cover} alt="" loading="lazy" decoding="async" />
          )}
          <article className={styles.article}>
            <div className={styles.titleRow}>
              {node.icon ? (
                <span className={styles.icon} aria-hidden="true">
                  {node.icon}
                </span>
              ) : (
                <Glyph node={node} />
              )}
              <h2 className={styles.title}>{node.title}</h2>
            </div>
            <div className={styles.chips}>
              {chips.map((c) => (
                <span key={c} className={`${controls.mono} ${styles.meta}`}>
                  {c}
                </span>
              ))}
            </div>

            {node.kind === 'leaf' && node.sha && (
              <LeafBody graph={graph} sha={node.sha} href={href} />
            )}

            {node.children.length > 0 && (
              <div className={styles.group}>
                <h3 className={controls.eyebrow}>
                  {node.kind === 'root'
                    ? 'Branches'
                    : node.kind === 'leaf'
                      ? 'Sub-leaves'
                      : 'Inside this branch'}
                </h3>
                <div className={styles.kids}>
                  {node.children.map((child) => (
                    <button
                      key={child}
                      type="button"
                      className={styles.kid}
                      onClick={() => onSelect(child)}
                    >
                      <Glyph node={graph.nodes.get(child)!} />
                      {named(child)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {out.length > 0 && (
              <ThreadList
                title="Threads out · mentioned here"
                ids={out}
                prefix="@ "
                named={named}
                where={where}
                onSelect={onSelect}
              />
            )}
            {into.length > 0 && (
              <ThreadList
                title="Threads in · mentioned by"
                ids={into}
                incoming
                named={named}
                where={where}
                onSelect={onSelect}
              />
            )}
          </article>
        </div>
      </div>

      <div className={styles.foot}>
        <span className={`${controls.mono} ${styles.path}`}>{path}</span>
        {!expanded && node.kind === 'leaf' && (
          <button
            type="button"
            className={`${controls.ghost} ${styles.openLeaf}`}
            onClick={() => onExpand(true)}
          >
            Open leaf
            <Icon name="arrowRight" />
          </button>
        )}
      </div>
    </section>
  )
}

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

function ThreadList({
  title,
  ids,
  prefix = '',
  incoming = false,
  named,
  where,
  onSelect,
}: {
  title: string
  ids: string[]
  prefix?: string
  incoming?: boolean
  named(id: string): string
  where(id: string): string
  onSelect(id: string): void
}) {
  return (
    <div className={styles.group}>
      <h3 className={controls.eyebrow}>{title}</h3>
      <div className={styles.threads}>
        {ids.map((id) => (
          <button key={id} type="button" className={styles.thread} onClick={() => onSelect(id)}>
            <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
              <path
                d={incoming ? 'M17 9C12 9 11 1 1 1' : 'M1 9C6 9 7 1 17 1'}
                data-incoming={incoming || undefined}
              />
            </svg>
            <span className={styles.threadTitle}>
              {prefix}
              {named(id)}
            </span>
            <span className={`${controls.mono} ${styles.threadWhere}`}>{where(id)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LeafBody({ graph, sha, href }: { graph: Graph; sha: string; href(id: string): string }) {
  const [html, setHtml] = useState<{ sha: string; html: string } | null>(null)
  useEffect(() => {
    let live = true
    void readBlob(sha).then(async (text) => {
      if (text === undefined || !live) return
      const rendered = await renderLeaf(
        text,
        {
          leafHref: (path) => (graph.nodes.get(path)?.kind === 'leaf' ? href(path) : null),
          leafIcon: (path) => graph.nodes.get(path)?.icon ?? null,
        },
        sha,
      )
      if (live) setHtml({ sha, html: rendered })
    })
    return () => {
      live = false
    }
  }, [sha, graph, href])

  if (html?.sha !== sha) return <div className={styles.loading} aria-busy="true" />
  return (
    <div className={`reading ${styles.content}`} dangerouslySetInnerHTML={{ __html: html.html }} />
  )
}
