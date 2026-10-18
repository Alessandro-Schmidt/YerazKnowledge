// The Peek: the selected node, floating over the map (420 px), or its full page when
// expanded (760 px column). On phones it is a bottom sheet. A leaf is editable in all three.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import type { TreeRef } from '../github/graphql'
import {
  compactWords,
  crumbs,
  ghostsFrom,
  textFile,
  threadEnd,
  type Ghost,
  type Graph,
} from '../model/graph'
import { ROOT } from '../model/tree'
import { mark } from '../perf'
import { session } from '../store/session'
import { LeafEditor } from '../editor/LeafEditor'
import { FAMILY_TEXT, treesOf } from '../map/family'
import { ownPath } from '../model/parse'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import { InlineName } from '../ui/InlineName'
import { treeHref } from '../ui/paths'
import styles from './Peek.module.css'
import { coverPosition } from './cover'
import { leafColors } from './colors'
import { downloadAsset } from './files'
import { History } from './History'
import { Cover } from './LeafLook'
import { printLeaf } from './print'
import { renderLeaf } from './render'
import { planGhostLeaf } from '../sync/structure'
import type { StructureAction } from '../ui/StructureDialogs'

export interface PeekProps {
  tree: TreeRef
  graph: Graph
  id: string
  expanded: boolean
  /** The leaf was just created: its editor takes the focus, to write below the title. */
  created?: boolean
  href(id: string): string
  onSelect(id: string): void
  onExpand(expanded: boolean): void
  onClose(): void
  /** A structure action: new leaf or branch, move, delete. */
  onAction(action: StructureAction): void
  /** A ghost was written: the new leaf, ready to write in. */
  onWritten(id: string): void
}

export function Peek({
  tree,
  graph,
  id,
  expanded,
  created,
  href,
  onSelect,
  onExpand,
  onClose,
  onAction,
  onWritten,
}: PeekProps) {
  const [menu, setMenu] = useState(false)
  const [source, setSource] = useState(false)
  /** The leaf whose history is shown in place of its editor. */
  const [historyOf, setHistoryOf] = useState<string | null>(null)
  useLayoutEffect(() => mark('peek-painted'), [id])
  const ghost = graph.ghosts.get(id)
  if (ghost) {
    return (
      <GhostPeek
        {...{ tree, graph, ghost, expanded, onSelect, onExpand, onClose }}
        onWritten={onWritten}
      />
    )
  }
  const node = graph.nodes.get(id)!
  // The repository is the Family; a folder at its top is one of its Trees.
  const kind =
    node.kind === 'root'
      ? 'Family'
      : node.kind === 'leaf'
        ? 'Leaf'
        : node.parent === ROOT
          ? 'Tree'
          : 'Branch'
  const out = [...(graph.out.get(id) ?? []), ...ghostsFrom(graph, id)]
  const into = graph.in.get(id) ?? []
  // The Family lists its Trees; its README.md is its text, shown above them.
  const readme = node.kind === 'root' ? graph.nodes.get(FAMILY_TEXT) : undefined
  const children = node.kind === 'root' ? treesOf(graph) : node.children
  const crumb =
    node.kind === 'root'
      ? `github.com/${tree.repo}`
      : [graph.nodes.get(ROOT)!.title, ...crumbs(graph, id)].join(' / ')
  const path =
    node.kind === 'root' ? `${tree.repo} @ ${tree.branch}` : node.kind === 'branch' ? `${id}/` : id
  const chips =
    node.kind === 'root'
      ? [
          count(treesOf(graph).length, 'tree'),
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

  const { named, where } = threadNames(graph)

  return (
    <section
      className={styles.peek}
      data-expanded={expanded || undefined}
      aria-label={`${kind} preview`}
    >
      <PeekHead {...{ kind, crumb, expanded, onExpand, onClose }} />

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
            {node.kind === 'leaf' && historyOf === id ? (
              <History
                repo={tree.repo}
                path={id}
                onClose={() => setHistoryOf(null)}
                view={(text, sha) => (
                  <ReadText
                    repo={tree.repo}
                    graph={graph}
                    id={id}
                    sha={sha}
                    text={text}
                    href={href}
                  />
                )}
              />
            ) : node.kind === 'leaf' ? (
              <LeafEditor
                key={`${tree.repo} ${id}`}
                repo={tree.repo}
                path={id}
                source={source}
                autoFocus={created}
                onOpen={onSelect}
              />
            ) : (
              <div className={styles.titleRow}>
                <Glyph node={node} />
                <h2 className={styles.title}>
                  {node.kind === 'root' ? (
                    <InlineName
                      value={node.title}
                      label="Family name"
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

            {/* A branch's text (its folder's README.md): always in the leaf editor, ready to
                write, even before the file exists; the first save creates it. */}
            {node.kind === 'branch' && (
              <LeafEditor
                key={`${tree.repo} ${id}`}
                repo={tree.repo}
                path={textFile(graph, id)!}
                source={source}
                onOpen={onSelect}
              />
            )}

            {/* The Family's own text: the repository's README.md, as it reads. */}
            {node.kind === 'root' && readme?.sha && (
              <ReadText
                repo={tree.repo}
                graph={graph}
                id={FAMILY_TEXT}
                sha={readme.sha}
                href={href}
              />
            )}

            {children.length > 0 && (
              <div className={styles.group}>
                <h3 className={controls.eyebrow}>
                  {node.kind === 'root'
                    ? 'Trees'
                    : node.kind === 'leaf'
                      ? 'Sub-leaves'
                      : `Inside this ${kind.toLowerCase()}`}
                </h3>
                <div className={styles.kids}>
                  {children.map((child) => (
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
          {node.kind === 'root' && (
            <button
              type="button"
              className={controls.ghost}
              onClick={() => onAction({ kind: 'new-branch', parent: ROOT })}
            >
              <Icon name="plus" size={15} />
              New tree
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
                    <button type="button" role="menuitem" onClick={() => setHistoryOf(id)}>
                      History
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

function PeekHead({
  kind,
  crumb,
  expanded,
  onExpand,
  onClose,
}: { kind: string; crumb: string } & Pick<PeekProps, 'expanded' | 'onExpand' | 'onClose'>) {
  return (
    <>
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
    </>
  )
}

/** How a thread list names its ends, and where they are; a ghost is not written yet. */
const threadNames = (graph: Graph) => ({
  named(target: string) {
    const n = graph.nodes.get(target) ?? graph.ghosts.get(target)!
    return 'icon' in n && n.icon ? `${n.icon} ${n.title}` : n.title
  },
  where: (target: string) =>
    graph.ghosts.has(target)
      ? 'Not written yet'
      : [graph.nodes.get(ROOT)!.title, ...crumbs(graph, target)].join(' / '),
})

/**
 * A leaf linked to but not written yet: who links to it, and a button that writes it at
 * the path the links name, so they lead somewhere.
 */
function GhostPeek({
  tree,
  graph,
  ghost,
  expanded,
  onSelect,
  onExpand,
  onClose,
  onWritten,
}: { ghost: Ghost } & Pick<
  PeekProps,
  'tree' | 'graph' | 'expanded' | 'onSelect' | 'onExpand' | 'onClose' | 'onWritten'
>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { named, where } = threadNames(graph)
  const write = async () => {
    setBusy(true)
    setError(null)
    const { getState } = session
    try {
      // The new leaf takes its title from the first link to it.
      const linking = await getState()
        .textOf(tree.repo, textFile(graph, ghost.from[0]!)!)
        .catch(() => null)
      await getState().apply(tree.repo, [planGhostLeaf(ghost, linking)])
      onWritten(ghost.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <section
      className={styles.peek}
      data-expanded={expanded || undefined}
      aria-label="Leaf not written yet"
    >
      <PeekHead
        kind="Not written yet"
        crumb={[graph.nodes.get(ROOT)!.title, ...crumbs(graph, ghost.id)].join(' / ')}
        {...{ expanded, onExpand, onClose }}
      />
      <div className={styles.scroll}>
        <div className={styles.column}>
          <article className={styles.article}>
            <div className={styles.titleRow}>
              <span className={controls.glyph} data-kind="ghost" aria-hidden="true" />
              <h2 className={styles.title}>{ghost.title}</h2>
            </div>
            <p className={styles.ghostText}>
              {ghost.from.length === 1 ? 'A leaf links' : `${ghost.from.length} leaves link`} here,
              but this leaf isn’t written yet. Writing it creates the file the links name.
            </p>
            {error && (
              <p className={controls.error} role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className={`${controls.primary} ${styles.ghostWrite}`}
              disabled={busy}
              onClick={() => void write()}
            >
              <Icon name="plus" size={15} />
              Write this leaf
            </button>
            <ThreadList
              title="Threads in · mentioned by"
              ids={ghost.from}
              incoming
              named={named}
              where={where}
              onSelect={onSelect}
            />
          </article>
        </div>
      </div>
      <div className={styles.foot}>
        <span className={`${controls.mono} ${styles.path}`}>{ghost.id}</span>
      </div>
    </section>
  )
}

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

/** Links in a rendered text: to a leaf, or to a branch's README.md, which opens the branch. */
const linkTo = (graph: Graph, href: (id: string) => string) => (path: string) => {
  const end = threadEnd(graph, path)
  return end === null ? null : href(end)
}

/** The Family's text (README.md) as the read view draws it, or a past version of a leaf. */
function ReadText({
  repo,
  graph,
  id,
  sha,
  text: given,
  href,
}: {
  repo: string
  graph: Graph
  id: string
  sha: string
  text?: string
  href(id: string): string
}) {
  const [html, setHtml] = useState<{ sha: string; html: string } | null>(null)
  useEffect(() => {
    let live = true
    const { getState } = session
    void Promise.resolve(given ?? getState().textOf(repo, id))
      .then((text) =>
        renderLeaf(text, {
          leafHref: linkTo(graph, href),
          leafIcon: (path) => graph.nodes.get(path)?.icon ?? null,
          files: () => getState().files(repo),
          size: (path) => getState().fileSize(repo, path),
          tree: (other) => {
            const t = getState().trees.find((t) => t.repo.toLowerCase() === other.toLowerCase())
            return t ? { title: t.title, href: `#${treeHref(t.repo)}` } : null
          },
        }),
      )
      .then((rendered) => live && setHtml({ sha, html: rendered }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [repo, id, sha, given, graph, href])

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
      onClick={footnoteJump}
    />
  )
}

/** A footnote's link scrolls to its note (and back) instead of changing the app's route. */
function footnoteJump(event: MouseEvent<HTMLElement>) {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#fn"]')
  if (!link) return
  event.preventDefault()
  const id = CSS.escape(link.getAttribute('href')!.slice(1))
  event.currentTarget.querySelector(`#${id}`)?.scrollIntoView({ block: 'center' })
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
    leafHref: linkTo(graph, href),
    leafIcon: (path) => graph.nodes.get(path)?.icon ?? null,
    files: () => getState().files(repo),
    size: (path) => getState().fileSize(repo, path),
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
