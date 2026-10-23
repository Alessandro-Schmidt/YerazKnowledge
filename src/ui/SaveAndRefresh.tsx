// Issue #63: commit pending edits now (as Ctrl/Cmd+S does), and bring in what other devices
// committed (the read path again: one request, a free 304 when nothing changed). For one
// Family, or every Family on one map (AllView).

import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import styles from './FamilyView.module.css'
import { Icon } from './icons'
import { isMac } from './platform'

export function SaveAndRefresh({ repos }: { repos: readonly string[] }) {
  const keys = repos.map((r) => r.toLowerCase())
  const unsaved = useSession((s) =>
    keys.some((k) => {
      const sync = s.sync[k]
      return !!sync && 'files' in sync && sync.files > 0 && sync.status !== 'saving'
    }),
  )
  const loading = useSession((s) => keys.some((k) => s.data[k]?.status === 'loading'))
  return (
    <>
      <button
        type="button"
        className={`${controls.iconButton} ${styles.save}`}
        aria-label="Save now"
        title={`Save now (${isMac ? '⌘S' : 'Ctrl+S'})`}
        disabled={!unsaved}
        data-unsaved={unsaved || undefined}
        onClick={() => void Promise.all(repos.map((r) => session.getState().flush(r)))}
      >
        <Icon name="save" size={18} />
      </button>
      <button
        type="button"
        className={`${controls.iconButton} ${styles.refresh}`}
        aria-label="Refresh"
        title="Refresh"
        aria-busy={loading || undefined}
        disabled={loading}
        onClick={() => void Promise.all(repos.map((r) => session.getState().open(r)))}
      >
        <Icon name="refresh" size={18} />
      </button>
    </>
  )
}
