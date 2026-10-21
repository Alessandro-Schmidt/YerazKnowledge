// The introduction: the logo and the name, then where the notes live, GitHub or a folder.
// Signed out it is the whole app, its steps kept here so the address stays (a link followed
// through sign-in still opens). Signed in, the Yeraz logo opens it at `#/welcome[/github|/folder]`.

import { useState, type FormEvent } from 'react'
import { useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { ConnectDialog } from './FamilyMenu'
import { Icon } from './icons'
import { allHref, treeHref } from './paths'
import { CreateTreeDialog } from './StructureDialogs'
import styles from './TokenScreen.module.css'
import { TopBar } from './TopBar'

const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new'
const brand = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`

type Step = 'welcome' | 'github' | 'folder'

/** Signed out: the introduction. */
export function TokenScreen() {
  const [step, setStep] = useState<Step>('welcome')
  return <Intro step={step} go={setStep} />
}

/** Signed in: the introduction at `#/welcome`, a step at `#/welcome/:step`. */
export function WelcomeRoute({ step }: { step?: string }) {
  const [, navigate] = useLocation()
  return (
    <Intro
      step={step === 'github' || step === 'folder' ? step : 'welcome'}
      go={(to) => navigate(to === 'welcome' ? '/welcome' : `/welcome/${to}`)}
      onSignedIn={() => navigate('/')}
    />
  )
}

/** A new Family, from either step: open it. */
const open = (tree: TreeRef) => {
  void session.getState().open(tree.repo)
  location.hash = `#${treeHref(tree.repo)}`
}

function Intro({
  step,
  go,
  onSignedIn,
}: {
  step: Step
  go(step: Step): void
  onSignedIn?: () => void
}) {
  // Read once: signing in sets the token before GitHub has accepted it.
  const [github] = useState(() => session.getState().token !== null)
  const back = () => go('welcome')
  return (
    <div className={styles.page}>
      <TopBar home={back} />
      <main className={styles.main}>
        {step === 'welcome' && <Welcome choose={go} />}
        {step === 'github' &&
          (github ? <Repositories back={back} /> : <GitHub onDone={onSignedIn} back={back} />)}
        {step === 'folder' && <Folder back={back} />}
      </main>
    </div>
  )
}

function Welcome({ choose }: { choose(step: Step): void }) {
  const onDevice = useSession((s) => s.onDevice)
  // Back to every Family together, or to the only one.
  const families = useSession((s) => (s.phase === 'signed-in' ? s.trees.length : 0))
  const choices = [
    {
      step: 'github' as const,
      icon: 'repo' as const,
      name: 'GitHub',
      text: 'Your own repositories. Every device you sign in on sees the same notes.',
    },
    {
      step: 'folder' as const,
      icon: 'folder' as const,
      name: 'Folder',
      text: onDevice
        ? "This browser's own storage. No account needed."
        : 'A folder on this computer. No account needed.',
    },
  ]
  return (
    <div className={styles.card}>
      <div className={styles.hero}>
        {/* Both marks are present; CSS shows the one for the current mode, as in the top bar. */}
        <img className={`${styles.logo} ${styles.logoDark}`} src={brand('yeraz-mark.svg')} alt="" />
        <img
          className={`${styles.logo} ${styles.logoLight}`}
          src={brand('yeraz-mark-light.svg')}
          alt=""
        />
        <h1 className={styles.name}>Yeraz</h1>
        <p className={styles.lead}>Your notes as Markdown, on a map. Where should they live?</p>
      </div>
      <div className={styles.choices}>
        {choices.map((c) => (
          <button
            key={c.step}
            type="button"
            className={styles.choice}
            onClick={() => choose(c.step)}
            aria-labelledby={`choice-${c.step}`}
            aria-describedby={`choice-${c.step}-text`}
          >
            <Icon name={c.icon} size={20} />
            <span id={`choice-${c.step}`} className={styles.choiceName}>
              {c.name}
            </span>
            <span id={`choice-${c.step}-text`} className={styles.choiceText}>
              {c.text}
            </span>
          </button>
        ))}
      </div>
      {families > 0 && (
        <a className={styles.home} href={families > 1 ? `#${allHref()}` : '#/'}>
          Back to your notes
          <Icon name="arrowRight" />
        </a>
      )}
    </div>
  )
}

function Back({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className={`${controls.ghost} ${styles.back}`} onClick={onClick}>
      <Icon name="chevronLeft" />
      Back
    </button>
  )
}

/** Signed in to GitHub already: connect another repository, or create one. */
function Repositories({ back }: { back(): void }) {
  const [dialog, setDialog] = useState<'connect' | 'create' | null>(null)
  return (
    <div className={styles.card}>
      <Back onClick={back} />
      <h1 className={styles.title}>Your GitHub repositories</h1>
      <p className={styles.lead}>
        Each Family is one of your repositories. Connect one that holds notes already, or create a
        new one.
      </p>
      <button type="button" className={controls.primary} onClick={() => setDialog('create')}>
        <Icon name="plus" />
        Create a new repository
      </button>
      <button type="button" className={controls.ghost} onClick={() => setDialog('connect')}>
        <Icon name="repo" />
        Connect repository
      </button>
      {dialog === 'connect' && <ConnectDialog onClose={() => setDialog(null)} onConnected={open} />}
      {dialog === 'create' && <CreateTreeDialog onClose={() => setDialog(null)} onCreated={open} />}
    </div>
  )
}

function GitHub({ onDone, back }: { onDone?: () => void; back(): void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token.trim()) return
    setBusy(true)
    setError(null)
    try {
      await session.getState().signIn(token)
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <Back onClick={back} />
      <h1 className={styles.title}>Connect GitHub</h1>
      <p className={styles.lead}>
        Your notes live in your own GitHub repositories. Yeraz reads and writes them with a personal
        access token that stays on this device.
      </p>
      <ol className={styles.steps}>
        <li>
          <a href={NEW_TOKEN} target="_blank" rel="noreferrer">
            Create a fine-grained token <Icon name="external" size={13} />
          </a>
        </li>
        <li>
          Under Repository access, choose the repositories that hold your notes, or all
          repositories.
        </li>
        <li>
          Under Permissions, set <strong>Contents</strong> to <em>Read and write</em>. Metadata
          stays read-only.
        </li>
        <li>Paste the token here.</li>
      </ol>
      <label className={styles.field}>
        <span className={controls.eyebrow}>Personal access token</span>
        <input
          className={`${controls.input} ${controls.mono}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="github_pat_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'token-error' : undefined}
        />
      </label>
      {error && (
        <p id="token-error" className={controls.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={controls.primary} disabled={busy || !token.trim()}>
        {busy ? 'Checking…' : 'Continue'}
        {!busy && <Icon name="arrowRight" />}
      </button>
      <p className={styles.fine}>
        A Family is any repository with a <code>.yeraz.json</code> file at its root, and every
        folder or leaf at its top is a Tree. The app opens on yours next.
      </p>
    </form>
  )
}

/** A new project folder by name, or a folder of notes there already. */
function Folder({ back }: { back(): void }) {
  const can = useSession((s) => s.folders)
  const onDevice = useSession((s) => s.onDevice)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** With a name, a new project; without, an existing folder. */
  async function add(project?: string) {
    setError(null)
    setBusy(true)
    try {
      const tree = await session.getState().addFolder(project)
      if (tree) open(tree)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <div className={styles.card}>
      <Back onClick={back} />
      <h1 className={styles.title}>{onDevice ? 'New project' : 'New project folder'}</h1>
      <p className={styles.lead}>
        {onDevice
          ? "No GitHub account needed. This browser can't keep a folder open, so Yeraz keeps the project in its own storage here."
          : 'No GitHub account needed. Yeraz makes a folder for your notes wherever you choose. In iCloud Drive, Dropbox or OneDrive, your other devices see it too.'}
      </p>
      {can ? (
        <>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              void add(name)
            }}
          >
            <label className={styles.field}>
              <span className={controls.eyebrow}>Name</span>
              <input
                className={controls.input}
                placeholder="Work notes"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'folder-error' : undefined}
              />
            </label>
            <button type="submit" className={controls.primary} disabled={busy}>
              <Icon name={onDevice ? 'plus' : 'folder'} />
              {onDevice ? 'Create project' : 'Choose where to create it…'}
            </button>
          </form>
          {error && (
            <p id="folder-error" className={controls.error} role="alert">
              {error}
            </p>
          )}
          <p className={styles.or}>or</p>
          <button
            type="button"
            className={controls.ghost}
            disabled={busy}
            onClick={() => void add()}
          >
            <Icon name="folder" />
            {onDevice ? 'Copy in a folder' : 'Open an existing folder'}
          </button>
        </>
      ) : (
        <p className={controls.hint}>
          This browser can't open folders. Use Chrome or Edge on a computer, or the desktop app.
        </p>
      )}
    </div>
  )
}
