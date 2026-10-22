import { useState, type FormEvent } from 'react'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { FolderButton } from './FolderButton'
import { Icon } from './icons'
import { treeHref } from './paths'
import styles from './TokenScreen.module.css'
import { TopBar } from './TopBar'

const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new'

/** Connect GitHub, or use a folder instead. `onDone` runs after a token is accepted. */
export function TokenScreen({ onDone }: { onDone?: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const onDevice = useSession((s) => s.onDevice)

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
    <div className={styles.page}>
      <TopBar />
      <main className={styles.main}>
        <div className={styles.card}>
          {/* The folder's dialog below is a form too: one never sits inside the other. */}
          <form className={styles.form} onSubmit={submit}>
            <h1 className={styles.title}>Connect GitHub</h1>
            <p className={styles.lead}>
              Your notes live in your own GitHub repositories. Yeraz reads and writes them with a
              personal access token that stays on this device.
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
                Under Permissions, set <strong>Contents</strong> to <em>Read and write</em>.
                Metadata stays read-only.
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
          <hr className={styles.or} />
          <h2 className={styles.subtitle}>
            {onDevice ? 'Or keep your notes on this device' : 'Or keep your notes in a folder'}
          </h2>
          <p className={styles.lead}>
            {onDevice
              ? "No GitHub account needed. This browser can't keep a folder open, so Yeraz keeps your notes in its own storage here: start empty, or copy in a folder of notes. The folder itself isn't changed."
              : 'No GitHub account needed. Pick a folder on this computer: one that iCloud Drive, Dropbox, OneDrive or a shared drive keeps in sync brings your notes to your other devices too.'}
          </p>
          <FolderButton onAdded={(tree) => (location.hash = `#${treeHref(tree.repo)}`)} />
        </div>
      </main>
    </div>
  )
}
