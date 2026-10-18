// Search across every Tree (development-plan.md M4 step 4, issue #29): the top bar's search
// box, or Ctrl/Cmd+K anywhere. A combobox over leaves, branches and Trees by title, and over
// leaves by their text, read from the blob cache. Picking a result lights every match on the
// map (the Matches layer, TreeMap.tsx).

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { crumbs } from '../model/graph'
import { search, snippet, type Searchable } from '../model/search'
import { ROOT } from '../model/tree'
import { session, useSession } from '../store/session'
import { Icon } from './icons'
import { treeHref } from './paths'
import styles from './Search.module.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const LIMIT = 20

/** What a search found, by Tree (`owner/name`, lower case): the map lights these nodes. */
export interface Matches {
  query: string
  ids: Record<string, string[]>
}

/** `repo` is the Family on screen; `onMatches` receives what a picked search found. */
export function Search({ repo, onMatches }: { repo: string; onMatches(m: Matches): void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <button
        type="button"
        className={styles.box}
        aria-label="Search leaves, branches, trees"
        onClick={() => setOpen(true)}
      >
        <Icon name="search" size={16} />
        <span className={styles.placeholder}>Search leaves, branches, trees</span>
        <kbd className={styles.key}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      {open && <SearchDialog repo={repo} onMatches={onMatches} onClose={() => setOpen(false)} />}
    </>
  )
}

function SearchDialog({
  repo,
  onMatches,
  onClose,
}: {
  repo: string
  onMatches(m: Matches): void
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const trees = useSession((s) => s.trees)
  const data = useSession((s) => s.data)
  const [texts, setTexts] = useState<Record<string, Map<string, string>>>({})

  useEffect(() => {
    const d = dialog.current!
    if (!d.open) d.showModal()
    // Trees not opened yet are opened now, so they can be searched. Their text comes from
    // the blob cache once each is open: no request.
    let live = true
    for (const t of session.getState().trees) {
      const key = t.repo.toLowerCase()
      if (!session.getState().data[key]) void session.getState().open(t.repo)
      void session
        .getState()
        .texts(t.repo)
        .then(
          (m) => live && setTexts((all) => ({ ...all, [key]: m })),
          () => {},
        )
    }
    return () => {
      live = false
      d.close()
    }
  }, [])

  const items = useMemo(() => {
    const all: (Searchable & { where: string })[] = []
    for (const tree of trees) {
      const graph = data[tree.repo.toLowerCase()]?.graph
      all.push({
        repo: tree.repo,
        id: ROOT,
        title: tree.title,
        kind: 'tree',
        icon: null,
        where: tree.repo,
      })
      for (const node of graph?.nodes.values() ?? []) {
        if (node.kind === 'root') continue
        all.push({
          repo: tree.repo,
          id: node.id,
          title: node.title,
          kind: node.kind,
          icon: node.icon,
          text: node.kind === 'leaf' ? texts[tree.repo.toLowerCase()]?.get(node.id) : undefined,
          where: [tree.title, ...crumbs(graph!, node.id)].join(' / '),
        })
      }
    }
    return all
  }, [trees, data, texts])
  const hits = useMemo(() => search(query, items), [query, items])
  const results = hits.slice(0, LIMIT)
  const current = Math.min(active, results.length - 1)
  const matches = useMemo(() => {
    const ids: Record<string, string[]> = {}
    for (const h of hits) if (h.kind !== 'tree') (ids[h.repo.toLowerCase()] ??= []).push(h.id)
    return { query: query.trim(), ids }
  }, [hits, query])
  const here = matches.ids[repo.toLowerCase()]?.length ?? 0

  const go = (r: Searchable) => {
    onMatches(matches)
    window.location.hash = `#${treeHref(r.repo, r.kind === 'tree' ? undefined : r.id)}`
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label="Search"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className={styles.field}>
        <Icon name="search" size={18} />
        <input
          autoFocus
          className={styles.input}
          role="combobox"
          aria-label="Search titles and text"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={current >= 0 ? `${listId}-${current}` : undefined}
          placeholder="Search leaves, branches, trees"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter' && results[current]) go(results[current])
            else return
            e.preventDefault()
          }}
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className={styles.results}>
        {results.map((r, i) => (
          <li
            key={`${r.repo}:${r.id}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === current}
            className={styles.result}
            onMouseMove={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(r)}
          >
            <span className={styles.icon} data-kind={r.kind} aria-hidden="true">
              {r.icon}
            </span>
            <span className={styles.title}>{r.title}</span>
            <span className={styles.where}>{r.where}</span>
            {r.inText && <Snippet text={r.text!} query={query} />}
          </li>
        ))}
      </ul>
      {query.trim() && results.length === 0 && <p className={styles.none}>Nothing matches.</p>}
      {here > 0 && (
        <button
          type="button"
          className={styles.light}
          onClick={() => {
            onMatches(matches)
            onClose()
          }}
        >
          Light up {here} {here === 1 ? 'match' : 'matches'} on the map
        </button>
      )}
    </dialog>
  )
}

/** Where the query shows in a leaf's text. */
function Snippet({ text, query }: { text: string; query: string }) {
  const cut = snippet(text, query)
  if (!cut) return null
  return (
    <span className={styles.snippet}>
      {cut.before}
      <mark>{cut.match}</mark>
      {cut.after}
    </span>
  )
}
