// The introduction: the logo and the name, then where the notes live, GitHub or a folder.
// Signed out it is the whole app, its steps kept here so the address stays (a link followed
// through sign-in still opens). Signed in, the Yeraz logo opens it at `#/welcome[/github|/folder]`;
// `#/welcome/token` is the token form again, to replace the token (expired, or for other repositories).

import { useState, type FormEvent } from 'react'
import { useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { isFolder } from '../local/folder'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { ConnectDialog } from './FamilyMenu'
import { Icon } from './icons'
import { allHref, treeHref } from './paths'
import { CreateTreeDialog } from './StructureDialogs'
import styles from './TokenScreen.module.css'
import { TopBar } from './TopBar'

const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new'
const TOKENS = 'https://github.com/settings/personal-access-tokens'
const brand = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`

type Step = 'welcome' | 'github' | 'folder' | 'token'
const STEPS: readonly string[] = ['github', 'folder', 'token']

/** Signed out: the introduction. */
export function TokenScreen() {
  const [step, setStep] = useState<Step>('welcome')
  // Signed in from here, an address naming a Family or a leaf is kept (a link followed through
  // sign-in); one of the introduction's own would show it again, so the notes open instead.
  const home = () => {
    if (/^#\/welcome(\/|$)/.test(location.hash)) location.replace('#/')
  }
  return <Intro step={step} go={setStep} onSignedIn={home} />
}

/** Signed in: the introduction at `#/welcome`, a step at `#/welcome/:step`. */
export function WelcomeRoute({ step }: { step?: string }) {
  const [, navigate] = useLocation()
  return (
    <Intro
      step={step && STEPS.includes(step) ? (step as Step) : 'welcome'}
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
      <main id="main" tabIndex={-1} className={styles.main}>
        {step === 'welcome' && <Welcome choose={go} />}
        {step === 'github' &&
          (github ? <Repositories go={go} /> : <GitHub onDone={onSignedIn} back={back} />)}
        {step === 'token' &&
          (github ? (
            <GitHub
              change
              onDone={() =>
                session.getState().trees.some((t) => !isFolder(t.repo))
                  ? onSignedIn?.()
                  : go('github')
              }
              back={() => go('github')}
            />
          ) : (
            <GitHub onDone={onSignedIn} back={back} />
          ))}
        {step === 'folder' && <Folder back={back} />}
      </main>
    </div>
  )
}

function Welcome({ choose }: { choose(step: Step): void }) {
  const onDevice = useSession((s) => s.onDevice)
  const github = useSession((s) => s.token !== null)
  // Back to every Family together, or to the only one.
  const families = useSession((s) => (s.phase === 'signed-in' ? s.trees.length : 0))
  // Signed in and nothing found: a warning for both homes, with a start from either (a fresh
  // start needs no telling).
  const empty = useSession((s) => s.phase === 'signed-in' && s.trees.length === 0)
  const folders = useSession((s) => s.folders)
  const [dialog, setDialog] = useState<'create' | null>(null)
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
        <p className={styles.lead}>
          Yeraz is a note-taking app. Your notes are Markdown files you own, and the main screen is
          a map of how they connect.
        </p>
      </div>
      <dl className={styles.topics}>
        <dt>Your files</dt>
        <dd>
          Each note is a Markdown file in a GitHub repository you own, or in a folder on this
          device. Nothing passes through a server of ours, and the files read well on github.com
          too.
        </dd>
        <dt>The map</dt>
        <dd>
          Folders are branches, notes are leaves, and a link from one note to another is a thread.
          The main screen draws them all as one map.
        </dd>
        <dt>Writing</dt>
        <dd>
          You write Markdown and see the result as you type, with @ mentions, images, code, math and
          videos.
        </dd>
        <dt>Saving</dt>
        <dd>
          Yeraz keeps your edits on this device as you type and commits them in the background.
        </dd>
      </dl>
      {empty && (
        <div className={styles.notice} role="status">
          <p>
            <strong>No notes yet.</strong>{' '}
            {github
              ? 'The GitHub token sees no repository with a notebook, and there is no project folder on this device. '
              : 'There is no project folder on this device. '}
            Start one here
            {github && (
              <>
                , or{' '}
                <a href={TOKENS} target="_blank" rel="noreferrer">
                  widen the token's repository access
                </a>
              </>
            )}
            .
          </p>
          <div className={styles.noticeActions}>
            {github && (
              <button
                type="button"
                className={controls.primary}
                onClick={() => setDialog('create')}
              >
                <Icon name="plus" />
                Create a repository
              </button>
            )}
            {folders && (
              <button
                type="button"
                className={github ? controls.ghost : controls.primary}
                onClick={() => choose('folder')}
              >
                <Icon name="folder" />
                {onDevice ? 'New project' : 'New project folder'}
              </button>
            )}
          </div>
        </div>
      )}
      {dialog === 'create' && <CreateTreeDialog onClose={() => setDialog(null)} onCreated={open} />}
      <p className={styles.ask}>Where should your notes live?</p>
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
      {github && (
        <p className={styles.fine}>
          GitHub is connected with a token kept on this device.{' '}
          <button type="button" className={styles.textButton} onClick={() => choose('token')}>
            Change token
          </button>
        </p>
      )}
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

/** Signed in to GitHub already: connect another repository, create one, or change the token. */
function Repositories({ go }: { go(step: Step): void }) {
  const [dialog, setDialog] = useState<'connect' | 'create' | null>(null)
  const none = useSession((s) => !s.trees.some((t) => !isFolder(t.repo)))
  return (
    <div className={styles.card}>
      <Back onClick={() => go('welcome')} />
      <h1 className={styles.title}>Your GitHub repositories</h1>
      <p className={styles.lead}>
        Each Family is one of your repositories. Connect one that holds notes already, or create a
        new one.
      </p>
      {none && (
        <p className={styles.notice} role="status">
          <strong>No notebook found.</strong> None of the repositories this token can see has notes.
          Create one, connect one that holds notes, or{' '}
          <a href={TOKENS} target="_blank" rel="noreferrer">
            widen the token's repository access
          </a>
          .
        </p>
      )}
      <button type="button" className={controls.primary} onClick={() => setDialog('create')}>
        <Icon name="plus" />
        Create a new repository
      </button>
      <button type="button" className={controls.ghost} onClick={() => setDialog('connect')}>
        <Icon name="repo" />
        Connect repository
      </button>
      <p className={styles.or}>or</p>
      <button type="button" className={controls.ghost} onClick={() => go('token')}>
        <Icon name="key" />
        Change token
      </button>
      {dialog === 'connect' && <ConnectDialog onClose={() => setDialog(null)} onConnected={open} />}
      {dialog === 'create' && <CreateTreeDialog onClose={() => setDialog(null)} onCreated={open} />}
    </div>
  )
}

/** The token form: to connect GitHub, or with `change`, to replace the token in use. */
function GitHub({
  onDone,
  back,
  change = false,
}: {
  onDone?: () => void
  back(): void
  change?: boolean
}) {
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
      <h1 className={styles.title}>{change ? 'Change your GitHub token' : 'Connect GitHub'}</h1>
      <p className={styles.lead}>
        {change
          ? 'Yeraz reads and writes your repositories with one personal access token, kept on this device. Paste a new one to replace it: when the old one expires, or to reach other repositories.'
          : 'Your notes live in your own GitHub repositories. Yeraz reads and writes them with a personal access token that stays on this device.'}
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
          name="token"
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
        {busy ? 'Checking…' : change ? 'Use this token' : 'Continue'}
        {!busy && <Icon name="arrowRight" />}
      </button>
      {change ? (
        <p className={styles.fine}>
          Your notes and unsaved edits stay on this device. The map then shows the Families the new
          token can see, with any you connected by name.
        </p>
      ) : (
        <p className={styles.fine}>
          A Family is any repository with a <code>.yeraz.json</code> file at its root, and every
          folder or leaf at its top is a Tree. The app opens on yours next.
        </p>
      )}
    </form>
  )
}

/** A new project folder by name, or a folder of notes there already. */
function Folder({ back }: { back(): void }) {
  const can = useSession((s) => s.folders)
  const onDevice = useSession((s) => s.onDevice)
  const closed = useSession((s) => s.closed)
  const none = useSession((s) => s.phase === 'signed-in' && !s.trees.some((t) => isFolder(t.repo)))
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** With a name, a new project; without, an existing folder. `seed`: its first files. */
  async function add(project?: string, seed?: Record<string, string>) {
    setError(null)
    setBusy(true)
    try {
      const tree = await session.getState().addFolder(project, seed)
      if (tree) open(tree)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }
  /** A closed project, kept on this device: open it again, or delete it. */
  const closedProject = async (handle: unknown, what: 'reopen' | 'discard') => {
    setError(null)
    setBusy(true)
    try {
      if (what === 'reopen') open(await session.getState().reopenFolder(handle))
      else await session.getState().discardClosed(handle)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }
  // A first look (owner's request): the example Family, kept like any other, to change or delete.
  const example = async () => {
    const { EXAMPLE_FILES, EXAMPLE_NAME } = await import('../example/files')
    await add(onDevice ? EXAMPLE_NAME : undefined, EXAMPLE_FILES)
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
      {none && can && (
        <p className={styles.notice} role="status">
          <strong>No project folder on this device yet.</strong> Make one here, open a folder of
          notes, or try the example.
        </p>
      )}
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
          <button
            type="button"
            className={controls.ghost}
            disabled={busy}
            title={
              onDevice
                ? 'A few example notes, kept on this device'
                : 'A few example notes, written into an empty folder you pick'
            }
            onClick={() => void example()}
          >
            <Icon name="face" />
            Try an example
          </button>
          {onDevice && closed.length > 0 && (
            <>
              <p className={styles.or}>closed, still on this device</p>
              <ul className={styles.closed} aria-label="Closed projects">
                {closed.map((c) => (
                  <li key={String(c.handle)}>
                    <button
                      type="button"
                      className={controls.ghost}
                      disabled={busy}
                      onClick={() => void closedProject(c.handle, 'reopen')}
                    >
                      <Icon name="folder" />
                      Open {c.title} again
                    </button>
                    <button
                      type="button"
                      className={controls.iconButton}
                      aria-label={`Delete ${c.title} from this device`}
                      title="Delete from this device"
                      disabled={busy}
                      onClick={() => void closedProject(c.handle, 'discard')}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className={controls.hint}>
          This browser can't open folders. Use Chrome or Edge on a computer, or the desktop app.
        </p>
      )}
    </div>
  )
}
