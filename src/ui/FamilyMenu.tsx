// The Family menu, beside the Family's name in the top bar: every connected Family (one
// repository each), then the secondary paths: connect another repository, create a new
// one, Appearance, sign out; and for the Family on screen, Rename and Remove (owner's
// request). Opening it looks for Families made on other devices.

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { Dialog, Field } from './Dialog'
import styles from './FamilyMenu.module.css'
import { Icon } from './icons'
import { isFolder } from '../local/folder'
import { allHref, treeHref } from './paths'
import { CreateTreeDialog } from './StructureDialogs'
import { ViewIcon } from '../views/ViewSwitcher'

/** The Family last shown on this device, so the app reopens on it. */
const LAST = 'yeraz-family'
export function lastFamily(): string | null {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}
/**
 * What `#/` opens on this device (issue #69): every Family together (the default), or the
 * Family last shown.
 */
const OPEN = 'yeraz-open'
export type OpenOn = 'all' | 'last'
export function openOn(): OpenOn {
  try {
    return localStorage.getItem(OPEN) === 'last' ? 'last' : 'all'
  } catch {
    return 'all'
  }
}
export function saveOpenOn(choice: OpenOn) {
  try {
    localStorage.setItem(OPEN, choice)
  } catch {
    // Private windows may refuse storage; the app then opens on every Family.
  }
}

export function rememberFamily(repo: string) {
  try {
    localStorage.setItem(LAST, repo)
  } catch {
    // Private windows may refuse storage; the app then opens on the first Family.
  }
}

/** `current`: the Family on screen; `all`: every Family on one map is. */
export function FamilyMenu({ current, all }: { current?: string; all?: boolean }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'connect' | 'create' | 'new' | 'rename' | 'remove' | null>(
    null,
  )
  const here = useSession((s) =>
    s.trees.find((t) => t.repo.toLowerCase() === current?.toLowerCase()),
  )
  const trees = useSession((s) => s.trees)
  const github = useSession((s) => s.token !== null)
  const folders = useSession((s) => s.folders)
  const onDevice = useSession((s) => s.onDevice)
  const [, navigate] = useLocation()
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void session.getState().discover()
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !host.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const go = (tree: TreeRef) => {
    setDialog(null)
    void session.getState().open(tree.repo)
    navigate(treeHref(tree.repo))
  }
  /** A folder, or on a device without folders a copy of one (or nothing), as a new Family. */
  const addFolder = (empty: boolean, name?: string) =>
    void session
      .getState()
      .addFolder(empty, name)
      .then(
        (tree) => tree && go(tree),
        (e: unknown) => window.alert(e instanceof Error ? e.message : String(e)),
      )
  const startFamily = async (name: string) => {
    const tree = await session.getState().addFolder(true, name)
    if (tree) go(tree)
  }

  return (
    <div ref={host} className={styles.host}>
      <button
        type="button"
        className={controls.iconButton}
        aria-label="Families"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div
          className={styles.menu}
          role="menu"
          aria-label="Families"
          onClick={() => setOpen(false)}
        >
          <span className={`${controls.eyebrow} ${styles.heading}`} role="presentation">
            Families
          </span>
          {trees.length > 1 && (
            <Link href={allHref()} role="menuitem" aria-current={all || undefined}>
              <span className={styles.name}>All Families</span>
              <span className={`${controls.mono} ${styles.repo}`}>on one map</span>
            </Link>
          )}
          {trees.map((t) => (
            <Link
              key={t.repo}
              href={treeHref(t.repo)}
              role="menuitem"
              aria-current={t.repo.toLowerCase() === current?.toLowerCase() || undefined}
            >
              <span className={styles.name}>{t.title}</span>
              <span className={`${controls.mono} ${styles.repo}`}>{t.folder ?? t.repo}</span>
            </Link>
          ))}
          {here && (
            <>
              <hr />
              <button type="button" role="menuitem" onClick={() => setDialog('rename')}>
                <Icon name="edit" size={15} />
                Rename Family
              </button>
              <button type="button" role="menuitem" onClick={() => setDialog('remove')}>
                <Icon name="trash" size={15} />
                Remove Family
              </button>
            </>
          )}
          <hr />
          {github ? (
            <>
              <button type="button" role="menuitem" onClick={() => setDialog('connect')}>
                <Icon name="repo" size={15} />
                Connect repository
              </button>
              <button type="button" role="menuitem" onClick={() => setDialog('create')}>
                <Icon name="plus" size={15} />
                Create a new repository
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={() => navigate('/github')}>
              <Icon name="repo" size={15} />
              Connect GitHub
            </button>
          )}
          {folders && (
            <button type="button" role="menuitem" onClick={() => addFolder(false)}>
              <Icon name="folder" size={15} />
              {onDevice ? 'Copy in a folder' : 'Use a folder'}
            </button>
          )}
          {onDevice && (
            <button type="button" role="menuitem" onClick={() => setDialog('new')}>
              <Icon name="plus" size={15} />
              New Family on this device
            </button>
          )}
          <hr />
          <button type="button" role="menuitem" onClick={() => navigate('/settings/appearance')}>
            <Icon name="contrast" size={15} />
            Appearance
          </button>
          <button type="button" role="menuitem" onClick={() => navigate('/settings/views')}>
            <ViewIcon view="treemap" />
            Views
          </button>
          <button type="button" role="menuitem" onClick={() => navigate('/settings/colours')}>
            <ViewIcon view="map" />
            Tree colours
          </button>
          {github && (
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                void session
                  .getState()
                  .signOut()
                  .then(() => navigate('/'))
              }
            >
              <Icon name="signOut" size={15} />
              Sign out
            </button>
          )}
        </div>
      )}
      {dialog === 'connect' && <ConnectDialog onClose={() => setDialog(null)} onConnected={go} />}
      {dialog === 'create' && <CreateTreeDialog onClose={() => setDialog(null)} onCreated={go} />}
      {dialog === 'new' && <NewFamilyDialog onClose={() => setDialog(null)} onName={startFamily} />}
      {dialog === 'rename' && here && (
        <RenameFamilyDialog tree={here} onClose={() => setDialog(null)} />
      )}
      {dialog === 'remove' && here && (
        <RemoveFamilyDialog
          tree={here}
          onClose={() => setDialog(null)}
          onRemoved={() => {
            setDialog(null)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}

/** Names a Family started from nothing in this device's storage (phones, Safari, Firefox). */
export function NewFamilyDialog({
  onName,
  onClose,
}: {
  /** Starts the Family; a thrown message is shown and the dialog stays open. */
  onName(name: string): Promise<void>
  onClose(): void
}) {
  const [value, setValue] = useState('Notes')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      title="New Family on this device"
      submit="Start"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true)
        setError(null)
        try {
          await onName(value.replace(/\s+/g, ' ').trim() || 'Notes')
          onClose()
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <Field
        label="Name"
        hint="Kept in this browser's storage on this device; copy it to a folder or a repository later."
      >
        <input
          className={controls.input}
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </Field>
    </Dialog>
  )
}

/** Renames the Family on screen (also done by clicking its name in the top bar). */
function RenameFamilyDialog({ tree, onClose }: { tree: TreeRef; onClose(): void }) {
  const [value, setValue] = useState(tree.title)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      title="Rename Family"
      submit="Rename"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true)
        setError(null)
        try {
          await session.getState().renameTree(tree.repo, value)
          onClose()
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <Field label="Name" hint="Written to the Family's .yeraz.json; files keep their names.">
        <input
          className={controls.input}
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </Field>
    </Dialog>
  )
}

/** Takes the Family on screen off this device; says what happens to its notes. */
function RemoveFamilyDialog({
  tree,
  onClose,
  onRemoved,
}: {
  tree: TreeRef
  onClose(): void
  onRemoved(): void
}) {
  const onDevice = useSession((s) => s.onDevice)
  const unsaved = useSession((s) => {
    const sync = s.sync[tree.repo.toLowerCase()]
    return sync && 'files' in sync ? sync.files : 0
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const folder = isFolder(tree.repo)
  const what =
    folder && onDevice
      ? 'Its notes are deleted from this device. Nothing else holds them.'
      : folder
        ? `The folder ${tree.folder ?? ''} and its files stay on this device; Yeraz stops showing it.`
        : `The repository ${tree.repo} stays on GitHub; Yeraz stops showing it on this device.`
  return (
    <Dialog
      title={`Remove ${tree.title}`}
      submit={folder && onDevice ? 'Delete' : 'Remove'}
      danger
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true)
        setError(null)
        try {
          await session.getState().removeTree(tree.repo)
          onRemoved()
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <p className={controls.hint}>
        {what}
        {unsaved > 0 && ` ${unsaved} unsaved ${unsaved === 1 ? 'edit is' : 'edits are'} lost.`}
      </p>
    </Dialog>
  )
}

/** Adds a repository by `owner/name`: one that holds a Family made elsewhere. */
export function ConnectDialog({
  onConnected,
  onClose,
}: {
  onConnected(tree: TreeRef): void
  onClose(): void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      title="Connect repository"
      submit="Connect"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true)
        setError(null)
        try {
          onConnected(await session.getState().connect(value))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <Field label="Repository" hint="A repository with a .yeraz.json file at its root.">
        <input
          className={`${controls.input} ${controls.mono}`}
          placeholder="owner/name"
          autoFocus
          required
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
    </Dialog>
  )
}
