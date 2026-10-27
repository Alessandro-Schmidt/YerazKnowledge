import { Component, type ReactNode } from 'react'
import controls from './controls.module.css'
import styles from './TokenScreen.module.css'

/** A bug shows this instead of a blank page. Pending edits are already on this device. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main id="main" tabIndex={-1} className={styles.main}>
        <div className={styles.card} role="alert">
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.lead}>
            Yeraz hit a bug and stopped this screen. Your edits are saved on this device and will be
            committed when the app opens again.
          </p>
          <p className={`${controls.mono} ${styles.fine}`}>{this.state.error.message}</p>
          <button type="button" className={controls.primary} onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </main>
    )
  }
}
