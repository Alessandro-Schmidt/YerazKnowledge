// The dialogs behind New leaf (one or many), New branch (New tree at the top of a Family),
// Move, Delete and Create a new repository
// (development-plan.md M2 steps 2 and 5). Plans come from sync/structure.ts.

import { useMemo, useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { crumbs, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { session } from '../store/session'
import {
  leavesUnder,
  moveReads,
  planDelete,
  planMove,
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

const where = (graph: Graph, id: string) =>
  id === ROOT
    ? 'At the top of the Family, as a Tree of its own'
    : [...crumbs(graph, id), graph.nodes.get(id)!.title].join(' / ')

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
  onDone(result: { edit?: string; select?: string | null }): void
  onClose(): void
}) {
  // The graph as it was when the dialog opened: applying the change updates the live one
  // while the dialog is still on screen, and the moved or deleted node is gone from it.
  const [graph] = useState(current)
  const [name, setName] = useState('')
  const [first, setFirst] = useState('')
  const [dest, setDest] = useState<string | null>(null)
  const [many, setMany] = useState(action.kind === 'new-leaf' && !!action.many)
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

  // Destinations for a move: anything outside the moved leaf's or branch's own subtree.
  const destinations = useMemo(() => {
    if (action.kind !== 'move') return []
    const moved = graph.nodes.get(action.id)!
    const prefix = `${moved.kind === 'leaf' ? action.id.slice(0, -3) : action.id}/`
    return [...graph.nodes.values()]
      .filter((n) => n.id !== action.id && !n.id.startsWith(prefix) && n.id !== moved.parent)
      .map((n) => n.id)
  }, [action, graph])

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
              if (!many) {
                const change = planNewLeaf(graph, action.parent, name)
                await session.getState().apply(tree.repo, [change])
                return onDone({ edit: change.path })
              }
              if (!titles.length) throw new Error('Write one title per line.')
              // One apply, so the autosave commits them all together.
              await session.getState().apply(tree.repo, planNewLeaves(graph, action.parent, titles))
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
              const paths = moveReads(graph, action.id)
              const texts = new Map(
                await Promise.all(
                  paths.map(
                    async (p) => [p, await session.getState().textOf(tree.repo, p)] as const,
                  ),
                ),
              )
              const { changes, id } = planMove(graph, (p) => texts.get(p)!, action.id, dest)
              await session.getState().apply(tree.repo, changes)
              onDone({ select: id })
            })
          }
        >
          <p className={styles.text}>
            {moved.kind === 'leaf'
              ? 'Its sub-leaves move with it, and every link to them is updated in the same commit.'
              : 'Everything in it moves with it, and every link to it is updated in the same commit.'}
          </p>
          <fieldset className={styles.fieldset}>
            <legend className={controls.eyebrow}>Move to</legend>
            <ul className={styles.list}>
              {destinations.map((id) => (
                <li key={id || 'root'}>
                  <label>
                    <input
                      type="radio"
                      name="dest"
                      checked={dest === id}
                      onChange={() => setDest(id)}
                    />
                    {where(graph, id)}
                    {graph.nodes.get(id)!.kind === 'leaf' && (
                      <span className={styles.hint}> · as a sub-leaf</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
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
