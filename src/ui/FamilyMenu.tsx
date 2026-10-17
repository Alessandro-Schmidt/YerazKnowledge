// The Family menu, beside the Family's name in the top bar: every connected Family (one
// repository each), then the secondary paths: connect another repository, create a new
// one, Appearance, sign out. Opening it looks for Families made on other devices.

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { Dialog, Field } from './Dialog'
import styles from './FamilyMenu.module.css'
import { Icon } from './icons'
import { treeHref } from './paths'
import { CreateTreeDialog } from './StructureDialogs'

/** The Family last shown on this device, so the app reopens on it. */
const LAST = 'yeraz-family'
export function lastFamily(): string | null {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}
export function rememberFamily(repo: string) {
  try {
    localStorage.setItem(LAST, repo)
  } catch {
    // Private windows may refuse storage; the app then opens on the first Family.
  }
}

export function FamilyMenu({ current }: { current?: string }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'connect' | 'create' | null>(null)
  const trees = useSession((s) => s.trees)
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
          {trees.map((t) => (
            <Link
              key={t.repo}
              href={treeHref(t.repo)}
              role="menuitem"
              aria-current={t.repo.toLowerCase() === current?.toLowerCase() || undefined}
            >
              <span className={styles.name}>{t.title}</span>
              <span className={`${controls.mono} ${styles.repo}`}>{t.repo}</span>
            </Link>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={() => setDialog('connect')}>
            <Icon name="repo" size={15} />
            Connect repository
          </button>
          <button type="button" role="menuitem" onClick={() => setDialog('create')}>
            <Icon name="plus" size={15} />
            Create a new repository
          </button>
          <hr />
          <button type="button" role="menuitem" onClick={() => navigate('/settings/appearance')}>
            <Icon name="contrast" size={15} />
            Appearance
          </button>
          <button type="button" role="menuitem" onClick={() => void session.getState().signOut()}>
            <Icon name="signOut" size={15} />
            Sign out
          </button>
        </div>
      )}
      {dialog === 'connect' && <ConnectDialog onClose={() => setDialog(null)} onConnected={go} />}
      {dialog === 'create' && <CreateTreeDialog onClose={() => setDialog(null)} onCreated={go} />}
    </div>
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
