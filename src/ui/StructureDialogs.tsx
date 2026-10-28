// The dialogs behind New leaf (one or many), New branch (New tree at the top of a Family),
// Move, Delete and Create a new repository
// (development-plan.md M2 steps 2 and 5). Plans come from sync/structure.ts.

import { useEffect, useMemo, useState } from 'react'
import { fileUrl, type TreeRef } from '../github/graphql'
import { crumbs, type Graph, type Template } from '../model/graph'
import { ROOT } from '../model/tree'
import { session, useSession } from '../store/session'
import {
  leavesUnder,
  moveReads,
  planDelete,
  planMove,
  planMoveAcross,
  planNewBranch,
  planNewLeaf,
  planNewLeaves,
  titlesIn,
} from '../sync/structure'
import controls from './controls.module.css'
import { Dialog, Field } from './Dialog'
import styles from './Dialog.module.css'

export type StructureAction =
  /** `many`: several leaves at once, one title per line. */
  | { kind: 'new-leaf'; parent: string; many?: boolean }
  | { kind: 'new-branch'; parent: string }
  | { kind: 'move'; id: string }
  | { kind: 'delete'; id: string }

/** Where new leaves and branches go: the selected branch, beside the selected leaf, or the root. */
export function parentFor(graph: Graph, selected: string | null): string {
  const node = selected !== null ? graph.nodes.get(selected) : undefined
  if (!node || node.kind === 'root') return ROOT
  return node.kind === 'branch' ? node.id : (node.parent ?? ROOT)
}

const where = (graph: Graph, id: string, family = 'the Family') =>
  id === ROOT
    ? `At the top of ${family}, as a Tree of its own`
    : [...crumbs(graph, id), graph.nodes.get(id)!.title].join(' / ')

/** A file's address from another Family. */
const urlOf = (ref: TreeRef) => (path: string) => fileUrl(ref, path)

/** Every word typed is somewhere in `label`, ignoring case. */
const matches = (label: string, query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => label.toLowerCase().includes(word))

export function StructureDialog({
  tree,
  graph: current,
  action,
  onDone,
  onClose,
}: {
  tree: TreeRef
  graph: Graph
  action: StructureAction
  /** Where to go afterwards: the leaf to edit or select, or null for the Tree. */
  onDone(result: { edit?: string; select?: string | null; repo?: string }): void
  onClose(): void
}) {
  // The graph as it was when the dialog opened: applying the change updates the live one
  // while the dialog is still on screen, and the moved or deleted node is gone from it.
  const [graph] = useState(current)
  const [name, setName] = useState('')
  const [first, setFirst] = useState('')
  const [dest, setDest] = useState<{ repo: string; id: string } | null>(null)
  const [query, setQuery] = useState('')
  const [many, setMany] = useState(action.kind === 'new-leaf' && !!action.many)
  // A template to start from (issue #41): this Family's, or another connected Family's.
  const [from, setFrom] = useState('')
  const templates = useTemplates(tree, graph)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  // Destinations for a move: anything outside the moved leaf's or branch's own subtree, here,
  // or anywhere in another Family (its name first).
  const trees = useSession((s) => s.trees)
  const data = useSession((s) => s.data)
  const moving = action.kind === 'move'
  useEffect(() => {
    if (!moving) return
    for (const t of session.getState().trees)
      if (!session.getState().data[t.repo.toLowerCase()]) void session.getState().open(t.repo)
  }, [moving])
  const destinations = useMemo(() => {
    if (action.kind !== 'move') return []
    const moved = graph.nodes.get(action.id)!
    const prefix = `${moved.kind === 'leaf' ? action.id.slice(0, -3) : action.id}/`
    const here = [...graph.nodes.values()]
      .filter((n) => n.id !== action.id && !n.id.startsWith(prefix) && n.id !== moved.parent)
      .map((n) => ({
        repo: tree.repo,
        id: n.id,
        label: where(graph, n.id),
        leaf: n.kind === 'leaf',
      }))
    const there = trees.flatMap((ref) => {
      const other = data[ref.repo.toLowerCase()]?.graph
      if (ref.repo.toLowerCase() === tree.repo.toLowerCase() || !other) return []
      return [...other.nodes.values()].map((n) => ({
        repo: ref.repo,
        id: n.id,
        label:
          n.id === ROOT ? where(other, ROOT, ref.title) : `${ref.title} / ${where(other, n.id)}`,
        leaf: n.kind === 'leaf',
      }))
    })
    return [...here, ...there]
  }, [action, graph, tree.repo, trees, data])
  const shown = destinations.filter((d) => matches(d.label, query))

  switch (action.kind) {
    case 'new-leaf': {
      const sub = graph.nodes.get(action.parent)?.kind === 'leaf'
      const titles = titlesIn(name)
      return (
        <Dialog
          title={
            sub ? (many ? 'New sub-leaves' : 'New sub-leaf') : many ? 'New leaves' : 'New leaf'
          }
          submit={
            !many
              ? 'Create leaf'
              : titles.length === 1
                ? 'Create 1 leaf'
                : `Create ${titles.length} leaves`
          }
          busy={busy}
          error={error}
          onClose={onClose}
          onSubmit={() =>
            run(async () => {
              const template = await templateText(templates, from)
              if (!many) {
                const change = planNewLeaf(graph, action.parent, name, template)
                await session.getState().apply(tree.repo, [change])
                return onDone({ edit: change.path })
              }
              if (!titles.length) throw new Error('Write one title per line.')
              // One apply, so the autosave commits them all together.
              await session
                .getState()
                .apply(tree.repo, planNewLeaves(graph, action.parent, titles, template))
              onDone({ select: action.parent })
            })
          }
        >
          {many ? (
            <Field label="Titles" hint={`One per line. ${where(graph, action.parent)}`}>
              <textarea
                className={`${controls.input} ${styles.lines}`}
                name="titles"
                autoComplete="off"
                autoFocus
                required
                rows={6}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Title" hint={where(graph, action.parent)}>
              <input
                className={controls.input}
                name="title"
                autoComplete="off"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          {templates.length > 0 && (
            <Field
              label="Start from"
              hint="A template's text, with its title, the date and the Tree filled in. Settings › Templates keeps them."
            >
              <select
                className={controls.input}
                name="template"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">A blank leaf</option>
                {templates.map((group) => (
                  <optgroup key={group.repo} label={group.label}>
                    {group.templates.map((t) => (
                      <option key={t.path} value={`${group.repo} ${t.path}`}>
                        {t.icon ? `${t.icon} ` : ''}
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
          )}
          {!action.many && (
            <button
              type="button"
              className={styles.switch}
              onClick={() => {
                // Back to one: the first title, as an input holds one line.
                if (many) setName(titles[0] ?? '')
                setMany(!many)
              }}
            >
              {many ? 'Just one' : 'Several at once'}
            </button>
          )}
        </Dialog>
      )
    }

    case 'new-branch': {
      // A folder at the top of the Family is a Tree.
      const atTop = action.parent === ROOT
      return (
        <Dialog
          title={atTop ? 'New tree' : 'New branch'}
          submit={atTop ? 'Create tree' : 'Create branch'}
          busy={busy}
          error={error}
          onClose={onClose}
          onSubmit={() =>
            run(async () => {
              const { leaf } = planNewBranch(graph, action.parent, name, first || 'Untitled')
              await session.getState().apply(tree.repo, [leaf])
              onDone({ edit: leaf.path })
            })
          }
        >
          <Field
            label={atTop ? 'Tree name' : 'Branch name'}
            hint={`${where(graph, action.parent)}. The folder keeps this name.`}
          >
            <input
              className={controls.input}
              name="name"
              autoComplete="off"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="First leaf"
            hint={`A ${atTop ? 'tree' : 'branch'} starts with one leaf: git stores no empty folders.`}
          >
            <input
              className={controls.input}
              name="first"
              autoComplete="off"
              placeholder="Untitled"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </Field>
        </Dialog>
      )
    }

    case 'move': {
      const moved = graph.nodes.get(action.id)!
      return (
        <Dialog
          title={`Move ${moved.title}`}
          submit="Move"
          busy={busy}
          error={error}
          onClose={onClose}
          onSubmit={() =>
            run(async () => {
              if (dest === null) throw new Error('Choose where to move it.')
              const s = session.getState()
              const texts = new Map(
                await Promise.all(
                  moveReads(graph, action.id).map(
                    async (p) => [p, await s.textOf(tree.repo, p)] as const,
                  ),
                ),
              )
              if (dest.repo === tree.repo) {
                const { changes, id } = planMove(graph, (p) => texts.get(p)!, action.id, dest.id)
                await s.apply(tree.repo, changes)
                return onDone({ select: id })
              }
              const to = trees.find((t) => t.repo === dest.repo)!
              const files = new Set(s.files(to.repo))
              const plan = planMoveAcross(
                { graph, textOf: (p) => texts.get(p)!, url: urlOf(tree) },
                action.id,
                {
                  graph: data[to.repo.toLowerCase()]!.graph!,
                  parent: dest.id,
                  url: urlOf(to),
                  taken: (p) => files.has(p),
                },
              )
              const copies = await Promise.all(
                [...plan.assets].map(async ([from, path]) => {
                  const bytes = await s.fileBytes(tree.repo, from)
                  return bytes ? [{ path, text: bytes }] : []
                }),
              )
              // Committed now, the other Family first: a failure in between leaves a copy.
              await s.apply(to.repo, [...plan.dest, ...copies.flat()])
              await s.flush(to.repo)
              await s.apply(tree.repo, plan.source)
              await s.flush(tree.repo)
              onDone({ select: plan.id, repo: to.repo })
            })
          }
        >
          <p className={styles.text}>
            {moved.kind === 'leaf'
              ? 'Its sub-leaves move with it, and every link to them is updated in the same commit.'
              : 'Everything in it moves with it, and every link to it is updated in the same commit.'}
          </p>
          <Field label="Where to">
            <input
              type="search"
              className={controls.input}
              placeholder="A Family, Tree, branch or leaf"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <fieldset className={styles.fieldset}>
            <legend className={controls.eyebrow}>Move to</legend>
            <ul className={styles.list}>
              {shown.map((d) => (
                <li key={`${d.repo}:${d.id}`}>
                  <label>
                    <input
                      type="radio"
                      name="dest"
                      checked={dest?.repo === d.repo && dest.id === d.id}
                      onChange={() => setDest(d)}
                    />
                    {d.label}
                    {d.leaf && <span className={styles.hint}> · as a sub-leaf</span>}
                  </label>
                </li>
              ))}
            </ul>
            {!shown.length && <p className={styles.hint}>Nothing matches.</p>}
          </fieldset>
        </Dialog>
      )
    }

    case 'delete': {
      const node = graph.nodes.get(action.id)!
      const { changes, linkedFrom } = planDelete(graph, action.id)
      // A branch's text (README.md) goes with it, but isn't a leaf.
      const leaves = leavesUnder(graph, action.id).length
      return (
        <Dialog
          title={`Delete ${node.title}`}
          submit={leaves > 1 ? `Delete ${leaves} leaves` : leaves ? 'Delete leaf' : 'Delete branch'}
          danger
          busy={busy}
          error={error}
          onClose={onClose}
          onSubmit={() =>
            run(async () => {
              await session.getState().apply(tree.repo, changes)
              onDone({ select: null })
            })
          }
        >
          <p className={styles.text}>
            {tree.folder !== undefined
              ? `This deletes ${leaves > 1 ? `${leaves} leaves` : 'it'} from the folder.`
              : leaves > 1
                ? `This deletes ${leaves} leaves. GitHub keeps them in the repository’s history.`
                : 'GitHub keeps it in the repository’s history.'}
          </p>
          {linkedFrom.length > 0 && (
            <p className={controls.error}>
              {linkedFrom.length === 1 ? '1 leaf links' : `${linkedFrom.length} leaves link`} here:{' '}
              {linkedFrom.map((p) => graph.nodes.get(p)!.title).join(', ')}. Those links will lead
              nowhere.
            </p>
          )}
        </Dialog>
      )
    }
  }
}

interface TemplateGroup {
  repo: string
  label: string
  templates: Template[]
}

/** The templates on offer: this Family's first, then each other open Family's, by name. */
function useTemplates(tree: TreeRef, graph: Graph): TemplateGroup[] {
  const trees = useSession((s) => s.trees)
  const data = useSession((s) => s.data)
  return useMemo(() => {
    const groups: TemplateGroup[] = []
    if (graph.templates.length)
      groups.push({ repo: tree.repo, label: `In ${tree.title}`, templates: graph.templates })
    for (const other of trees) {
      if (other.repo.toLowerCase() === tree.repo.toLowerCase()) continue
      const templates = data[other.repo.toLowerCase()]?.graph?.templates ?? []
      if (templates.length) groups.push({ repo: other.repo, label: `In ${other.title}`, templates })
    }
    return groups
  }, [tree, graph, trees, data])
}

/** The chosen template's text (`repo path`), or undefined for a blank leaf. */
async function templateText(groups: TemplateGroup[], chosen: string) {
  if (!chosen) return undefined
  const space = chosen.indexOf(' ')
  const repo = chosen.slice(0, space)
  const path = chosen.slice(space + 1)
  const template = groups.find((g) => g.repo === repo)?.templates.find((t) => t.path === path)
  if (!template) throw new Error("That template isn't there any more.")
  try {
    return { template: await session.getState().textOf(repo, path) }
  } catch {
    throw new Error("The template's text hasn't arrived yet. Try again in a moment.")
  }
}

export function CreateTreeDialog({
  onCreated,
  onClose,
}: {
  onCreated(tree: TreeRef): void
  onClose(): void
}) {
  const [title, setTitle] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suggested = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const repoName = touched ? name : suggested
  return (
    <Dialog
      title="Create a new repository"
      submit="Create repository"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true)
        setError(null)
        try {
          onCreated(await session.getState().createTree({ name: repoName, title }))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <Field label="Family name">
        <input
          className={controls.input}
          name="title"
          autoComplete="off"
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field
        label="Repository"
        hint="A new private repository on your GitHub account: a Family of its own."
      >
        <input
          className={`${controls.input} ${controls.mono}`}
          name="repo"
          autoComplete="off"
          required
          value={repoName}
          onChange={(e) => {
            setTouched(true)
            setName(e.target.value)
          }}
        />
      </Field>
    </Dialog>
  )
}
