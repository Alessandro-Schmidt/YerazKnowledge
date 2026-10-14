import { useState, type FormEvent } from 'react'
import { session } from '../store/session'
import controls from './controls.module.css'
import { Icon } from './icons'
import styles from './TokenScreen.module.css'
import { TopBar } from './TopBar'

const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new'

export function TokenScreen() {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <TopBar />
      <main className={styles.main}>
        <form className={styles.card} onSubmit={submit}>
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
              Under Repository access, choose the repositories that hold your Trees, or all
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
            A Tree is any repository with a <code>.yeraz.json</code> file at its root. Every one
            this token can see shows up on the next screen.
          </p>
        </form>
      </main>
    </div>
  )
}
