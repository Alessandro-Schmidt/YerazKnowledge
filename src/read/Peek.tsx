// The Peek: a partial view of the selected node, floating over the map (420 px), or the
// full read page when expanded (760 px column). On phones it is a bottom sheet.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { compactWords, crumbs, textFile, threadEnd, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { mark } from '../perf'
import { session } from '../store/session'
import { isLocal } from '../sync/overlay'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import { InlineName } from '../ui/InlineName'
import { treeHref } from '../ui/paths'
import styles from './Peek.module.css'
import { coverPosition } from './cover'
import { leafColors } from './colors'
import { downloadAsset } from './files'
import { Cover } from './LeafLook'
import { printLeaf } from './print'
import { renderLeaf } from './render'
import type { StructureAction } from '../ui/StructureDialogs'

export interface PeekProps {
  tree: TreeRef
  graph: Graph
  id: string
  expanded: boolean
  href(id: string): string
  onSelect(id: string): void
  onExpand(expanded: boolean): void
  onClose(): void
  /** Editing: open the editor, or start a structure action. */
  onEdit(id: string): void
  onAction(action: StructureAction): void
}

export function Peek({
  tree,
  graph,
  id,
  expanded,
  href,
  onSelect,
  onExpand,
  onClose,
  onEdit,
  onAction,
}: PeekProps) {
  const [menu, setMenu] = useState(false)
  const column = useRef<HTMLDivElement>(null)
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
        <div ref={column} className={styles.column}>
          <Cover
            repo={tree.repo}
            src={node.meta?.cover}
            position={coverPosition(node.meta)}
            className={styles.cover}
          />
          <article className={styles.article} style={leafColors(node.meta)} data-leaf="">
            <div className={styles.titleRow}>
              {node.icon ? (
                <span className={styles.icon} aria-hidden="true">
                  {node.icon}
                </span>
              ) : (
                <Glyph node={node} />
              )}
              <h2 className={styles.title}>
                {node.kind === 'root' ? (
                  <InlineName
                    value={node.title}
                    label="Tree name"
                    onRename={(name) => session.getState().renameTree(tree.repo, name)}
                  />
                ) : (
                  node.title
                )}
              </h2>
            </div>
            <div className={styles.chips}>
              {chips.map((c) => (
                <span key={c} className={`${controls.mono} ${styles.meta}`}>
                  {c}
                </span>
              ))}
            </div>

            {/* A leaf's text, or a branch's (its folder's README.md). */}
            {node.sha && (
              <LeafBody
                repo={tree.repo}
                graph={graph}
                id={textFile(graph, id)!}
                sha={node.sha}
                href={href}
              />
            )}
            {node.kind === 'branch' && !node.sha && (
              <button
                type="button"
                className={`${controls.ghost} ${styles.addText}`}
                onClick={() => onEdit(textFile(graph, id)!)}
              >
                <Icon name="pencil" size={15} />
                Add text
              </button>
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
        <div className={styles.actions}>
          {node.kind === 'leaf' ? (
            <button type="button" className={controls.ghost} onClick={() => onEdit(id)}>
              <Icon name="pencil" size={15} />
              Edit leaf
            </button>
          ) : (
            <button
              type="button"
              className={controls.ghost}
              onClick={() => onAction({ kind: 'new-leaf', parent: id })}
            >
              <Icon name="plus" size={15} />
              New leaf here
            </button>
          )}
          {node.kind !== 'root' && (
            <div className={styles.menuHost}>
              <button
                type="button"
                className={controls.iconButton}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((m) => !m)}
              >
                <Icon name="more" />
              </button>
              {menu && (
                <div className={styles.menu} role="menu" onClick={() => setMenu(false)}>
                  {node.kind === 'leaf' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => column.current && printLeaf(column.current)}
                    >
                      Export PDF
                    </button>
                  )}
                  {node.kind === 'leaf' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onAction({ kind: 'new-leaf', parent: id })}
                    >
                      Add sub-leaf
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onAction({ kind: 'new-leaf', parent: id, many: true })}
                  >
                    {node.kind === 'leaf' ? 'Add sub-leaves…' : 'New leaves here…'}
                  </button>
                  {node.kind === 'branch' && node.sha && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onEdit(textFile(graph, id)!)}
                    >
                      Edit text
                    </button>
                  )}
                  {node.kind === 'branch' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onAction({ kind: 'new-branch', parent: id })}
                    >
                      New branch here
                    </button>
                  )}
                  {node.kind === 'leaf' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onAction({ kind: 'move', id })}
                    >
                      Move…
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    data-danger
                    onClick={() => onAction({ kind: 'delete', id })}
                  >
                    Delete…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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

function LeafBody({
  repo,
  graph,
  id,
  sha,
  href,
}: {
  repo: string
  graph: Graph
  id: string
  sha: string
  href(id: string): string
}) {
  const [html, setHtml] = useState<{ sha: string; html: string } | null>(null)
  useEffect(() => {
    let live = true
    void session
      .getState()
      .textOf(repo, id)
      .then(async (text) => {
        if (!live) return
        const rendered = await renderLeaf(
          text,
          {
            // A link to a branch's README.md opens the branch.
            leafHref: (path) => {
              const end = threadEnd(graph, path)
              return end === null ? null : href(end)
            },
            leafIcon: (path) => graph.nodes.get(path)?.icon ?? null,
            files: () => session.getState().files(repo),
            size: (path) => session.getState().fileSize(repo, path),
            tree: (other) => {
              const t = session
                .getState()
                .trees.find((t) => t.repo.toLowerCase() === other.toLowerCase())
              return t ? { title: t.title, href: `#${treeHref(t.repo)}` } : null
            },
          },
          // Pending edits have no SHA yet, so they are not cached.
          isLocal(sha) ? undefined : sha,
        )
        if (live) setHtml({ sha, html: rendered })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [repo, id, sha, graph, href])

  // The Tree's own files (images, PDFs, videos) come from the blob cache, with the token.
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    for (const el of body.current?.querySelectorAll<HTMLElement>(
      '[data-asset], [data-asset-href]',
    ) ?? []) {
      const href = el.dataset.assetHref
      void session
        .getState()
        .assetUrl(repo, href ?? el.dataset.asset!)
        .then((url) => url && el.setAttribute(href ? 'href' : 'src', url))
    }
    // Attachments are downloaded only when their card is used.
    for (const el of body.current?.querySelectorAll<HTMLElement>('[data-asset-file]') ?? [])
      el.onclick = () =>
        void downloadAsset(el.dataset.assetFile!, (p) => session.getState().assetUrl(repo, p))
  }, [html, repo])

  if (html?.sha !== sha) return <div className={styles.loading} aria-busy="true" />
  return (
    <div
      ref={body}
      className={`reading ${styles.content}`}
      dangerouslySetInnerHTML={{ __html: html.html }}
    />
  )
}
