// The Family menu, beside the Family's name in the top bar: every connected Family (one
// repository each), then the secondary paths: connect another repository, create a new
// one, Appearance, sign out; and for the Family on screen, Rename and Remove (owner's
// request). Opening it looks for Families made on other devices.

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { NotFamilyError, session, useSession } from '../store/session'
import controls from './controls.module.css'
import { Dialog, Field } from './Dialog'
import styles from './FamilyMenu.module.css'
import { Icon } from './icons'
import { PHONE } from './useMedia'
import { focusFirst, menuKeys } from './menuKeys'
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
 * What `#/` opens on this device (issue #69): every Family together, or the Family last
 * shown. The default is every Family on a computer and the last Family on a phone, where
 * drawing every Family at once is what makes a big map slow.
 */
const OPEN = 'yeraz-open'
export type OpenOn = 'all' | 'last'
export function openOn(): OpenOn {
  const fallback: OpenOn = matchMedia(PHONE).matches ? 'last' : 'all'
  try {
    const saved = localStorage.getItem(OPEN)
    return saved === 'last' || saved === 'all' ? saved : fallback
  } catch {
    return fallback
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
  const [dialog, setDialog] = useState<
    'connect' | 'create' | 'rename' | 'remove' | 'publish' | null
  >(null)
  const here = useSession((s) =>
    s.trees.find((t) => t.repo.toLowerCase() === current?.toLowerCase()),
  )
  const trees = useSession((s) => s.trees)
  const github = useSession((s) => s.token !== null)
  const folders = useSession((s) => s.folders)
  const onDevice = useSession((s) => s.onDevice)
  const [, navigate] = useLocation()
  const host = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void session.getState().discover()
    focusFirst(menu.current)
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
  /** A folder, or on a device without folders a copy of one, as a new Family. */
  const addFolder = () =>
    void session
      .getState()
      .addFolder()
      .then(
        (tree) => tree && go(tree),
        (e: unknown) => window.alert(e instanceof Error ? e.message : String(e)),
      )

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
          ref={menu}
          className={styles.menu}
          role="menu"
          aria-label="Families"
          onClick={() => setOpen(false)}
          onKeyDown={menuKeys}
        >
          <span className={`${controls.eyebrow} ${styles.heading}`} role="presentation">
            Families
          </span>
          {trees.length > 1 && (
            <Link href={allHref()} role="menuitem" aria-current={all || undefined}>
              <span className={styles.name}>All projects</span>
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
              {/* A folder Family goes to GitHub to be tracked there (owner's request). */}
              {isFolder(here.repo) &&
                (github ? (
                  <button type="button" role="menuitem" onClick={() => setDialog('publish')}>
                    <Icon name="repo" size={15} />
                    Push to GitHub…
                  </button>
                ) : (
                  <Link href="/welcome/github" role="menuitem">
                    <Icon name="repo" size={15} />
                    Push to GitHub… (connect first)
                  </Link>
                ))}
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
            <Link href="/welcome/github" role="menuitem" className={styles.muted}>
              <Icon name="repo" size={15} />
              Connect GitHub
            </Link>
          )}
          {folders && (
            <>
              <Link href="/welcome/folder" role="menuitem" className={styles.muted}>
                <Icon name="plus" size={15} />
                {onDevice ? 'New project' : 'New project folder'}
              </Link>
              <button type="button" role="menuitem" onClick={addFolder}>
                <Icon name="folder" size={15} />
                {onDevice ? 'Copy in a folder' : 'Open an existing folder'}
              </button>
            </>
          )}
          <hr />
          <Link href="/settings/appearance" role="menuitem" className={styles.muted}>
            <Icon name="contrast" size={15} />
            Appearance
          </Link>
          <Link href="/settings/views" role="menuitem" className={styles.muted}>
            <ViewIcon view="treemap" />
            Views
          </Link>
          <Link href="/settings/colours" role="menuitem" className={styles.muted}>
            <ViewIcon view="map" />
            Tree colours
          </Link>
          <Link href="/settings/hidden" role="menuitem" className={styles.muted}>
            <Icon name="eyeOff" size={15} />
            Hidden
          </Link>
          <Link href="/settings/templates" role="menuitem" className={styles.muted}>
            <Icon name="template" size={15} />
            Templates
          </Link>
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
      {dialog === 'rename' && here && (
        <RenameFamilyDialog
          tree={here}
          onClose={() => setDialog(null)}
          onRenamed={(tree) => navigate(all ? allHref() : treeHref(tree.repo), { replace: true })}
        />
      )}
      {dialog === 'publish' && here && (
        <PublishDialog tree={here} onClose={() => setDialog(null)} onPublished={go} />
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

/**
 * Renames the Family on screen (also done by clicking its name in the top bar), and, for a
 * repository, its name on GitHub too when that field is changed (owner's request).
 */
function RenameFamilyDialog({
  tree,
  onClose,
  onRenamed,
}: {
  tree: TreeRef
  onClose(): void
  /** The repository was renamed: the Family's address changed. */
  onRenamed(tree: TreeRef): void
}) {
  const [value, setValue] = useState(tree.title)
  const [repo, setRepo] = useState(tree.name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const folder = isFolder(tree.repo)
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
          if (!folder && repo.trim() !== tree.name) {
            const renamed = await session.getState().renameRepository(tree.repo, repo)
            onClose()
            onRenamed(renamed)
            return
          }
          onClose()
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <Field label="Name" hint="Written to the Family’s .yeraz.json; files keep their names.">
        <input
          className={controls.input}
          name="name"
          autoComplete="off"
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </Field>
      {!folder && (
        <Field
          label="Repository"
          hint={`Renames ${tree.repo} on GitHub as well, once the pending edits are committed. GitHub keeps the old address pointing at it.`}
        >
          <input
            className={`${controls.input} ${controls.mono}`}
            name="repo"
            autoComplete="off"
            required
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        </Field>
      )}
    </Dialog>
  )
}

/** Pushes a folder Family to a new private repository, and shows the repository in its place. */
function PublishDialog({
  tree,
  onClose,
  onPublished,
}: {
  tree: TreeRef
  onClose(): void
  onPublished(tree: TreeRef): void
}) {
  const onDevice = useSession((s) => s.onDevice)
  const [name, setName] = useState(() =>
    tree.title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      title={`Push ${tree.title} to GitHub`}
      submit="Push"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true)
        setError(null)
        try {
          const next = await session.getState().publishFolder(tree.repo, name)
          onClose()
          onPublished(next)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <Field
        label="Repository"
        hint="A new private repository on your GitHub account, with every file, in one commit."
      >
        <input
          className={`${controls.input} ${controls.mono}`}
          name="repo"
          autoComplete="off"
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <p className={controls.hint}>
        {onDevice
          ? 'Yeraz then shows the repository instead, and the copy on this device is deleted: GitHub holds the notes.'
          : `Yeraz then shows the repository instead. The folder ${tree.folder ?? ''} stays on this computer as it is.`}
      </p>
    </Dialog>
  )
}

/** Takes a Family off this device; says what happens to its notes. */
export function RemoveFamilyDialog({
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
      ? 'Its notes stay on this device, and the Folder step of the introduction opens it again. Delete from device deletes them: nothing else holds them.'
      : folder
        ? `The folder ${tree.folder ?? ''} and its files stay on this device; Yeraz stops showing it. Delete from device deletes its files too, and keeps the empty folder.`
        : `The repository ${tree.repo} stays on GitHub; Yeraz stops showing it on this device.`
  const remove = async (files: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await session.getState().removeTree(tree.repo, { files })
      onRemoved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Dialog
      title={`Remove ${tree.title}`}
      submit="Remove"
      danger
      busy={busy}
      error={error}
      onClose={onClose}
      extra={folder ? { label: 'Delete from device', onClick: () => remove(true) } : undefined}
      onSubmit={() => remove(false)}
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
  const [start, setStart] = useState(false)
  return (
    <Dialog
      title="Connect repository"
      submit={start ? 'Turn into a notebook' : 'Connect'}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true)
        setError(null)
        try {
          onConnected(await session.getState().connect(value, start))
        } catch (e) {
          setStart(e instanceof NotFamilyError)
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }}
    >
      <Field label="Repository" hint="A repository with a .yeraz.json file at its root.">
        <input
          className={`${controls.input} ${controls.mono}`}
          name="repo"
          autoComplete="off"
          placeholder="owner/name"
          autoFocus
          required
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setStart(false)
          }}
        />
      </Field>
    </Dialog>
  )
}
