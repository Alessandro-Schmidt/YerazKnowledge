// The Peek: the selected node, floating over the map (420 px), or its full page when
// expanded (760 px column). On phones it is a bottom sheet. A leaf is editable in all three.

import { useLayoutEffect, useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { compactWords, crumbs, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { mark } from '../perf'
import { session } from '../store/session'
import { LeafEditor } from '../editor/LeafEditor'
import { ownPath } from '../model/parse'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import { InlineName } from '../ui/InlineName'
import { treeHref } from '../ui/paths'
import styles from './Peek.module.css'
import { coverPosition } from './cover'
import { leafColors } from './colors'
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
  /** A structure action: new leaf or branch, move, delete. */
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
  onAction,
}: PeekProps) {
  const [menu, setMenu] = useState(false)
  const [source, setSource] = useState(false)
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
        <div className={styles.column}>
          {node.kind !== 'leaf' && (
            <Cover
              repo={tree.repo}
              src={node.meta?.cover}
              position={coverPosition(node.meta)}
              className={styles.cover}
            />
          )}
          <article className={styles.article}>
            {node.kind === 'leaf' ? (
              <LeafEditor
                key={`${tree.repo} ${id}`}
                repo={tree.repo}
                path={id}
                source={source}
                onOpen={onSelect}
              />
            ) : (
              <div className={styles.titleRow}>
                <Glyph node={node} />
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
            )}
            <div className={styles.chips}>
              {chips.map((c) => (
                <span key={c} className={`${controls.mono} ${styles.meta}`}>
                  {c}
                </span>
              ))}
            </div>

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
          {node.kind !== 'leaf' && (
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
                      role="menuitemcheckbox"
                      aria-checked={source}
                      onClick={() => setSource((s) => !s)}
                    >
                      Show Markdown
                    </button>
                  )}
                  {node.kind === 'leaf' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        void printable(tree.repo, graph, id, href).then(printLeaf, () => undefined)
                      }
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

/**
 * The leaf as the read view draws it (ARCHITECTURE.md §8), for printing: cover, title and
 * the rendered text, with the Tree's own images loaded.
 */
async function printable(
  repo: string,
  graph: Graph,
  id: string,
  href: (id: string) => string,
): Promise<HTMLElement> {
  const { getState } = session
  const node = graph.nodes.get(id)!
  const html = await renderLeaf(await getState().textOf(repo, id), {
    leafHref: (path) => (graph.nodes.get(path)?.kind === 'leaf' ? href(path) : null),
    leafIcon: (path) => graph.nodes.get(path)?.icon ?? null,
    files: () => getState().files(repo),
    tree: (other) => {
      const t = getState().trees.find((t) => t.repo.toLowerCase() === other.toLowerCase())
      return t ? { title: t.title, href: `#${treeHref(t.repo)}` } : null
    },
  })
  const article = document.createElement('article')
  article.className = styles.article ?? ''
  article.dataset.leaf = ''
  for (const [name, value] of Object.entries(leafColors(node.meta)))
    article.style.setProperty(name, String(value))
  const title = document.createElement('h2')
  title.className = styles.title ?? ''
  title.textContent = `${node.icon ? `${node.icon} ` : ''}${node.title}`
  const body = document.createElement('div')
  body.className = `reading ${styles.content}`
  body.innerHTML = html
  article.append(title, body)

  const cover = typeof node.meta?.cover === 'string' ? node.meta.cover : null
  if (cover) {
    const img = document.createElement('img')
    img.className = styles.cover ?? ''
    const own = ownPath(cover)
    if (own !== null) img.dataset.asset = own
    else if (/^https:\/\//.test(cover)) img.src = cover
    img.style.objectPosition = `50% ${coverPosition(node.meta)}%`
    article.prepend(img)
  }
  await Promise.all(
    [...article.querySelectorAll<HTMLElement>('[data-asset], [data-asset-href]')].map(
      async (el) => {
        const link = el.dataset.assetHref
        const url = await getState().assetUrl(repo, link ?? el.dataset.asset!)
        if (url) el.setAttribute(link ? 'href' : 'src', url)
      },
    ),
  )
  await Promise.all(
    [...article.querySelectorAll('img')].map((img) => {
      img.loading = 'eager'
      return img.decode().catch(() => undefined)
    }),
  )
  return article
}
