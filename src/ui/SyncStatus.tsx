import { useEffect, useState } from 'react'
import { isFolder } from '../local/folder'
import { useSession, type SyncState } from '../store/session'
import styles from './SyncStatus.module.css'

/** "Synced", "Unsaved edits · auto-push in 1:24", "Saving…", "Offline" or "Conflict". A folder is saved in seconds: no countdown. */
export function SyncStatus({ repo, branch }: { repo: string; branch: string }) {
  const state = useSession((s) => s.sync[repo.toLowerCase()])
  const onDevice = useSession((s) => s.onDevice)
  const [now, setNow] = useState(() => Date.now())
  const ticking = state?.status === 'pending' && state.due !== null
  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [ticking])

  if (!state) return null
  return (
    <span className={styles.status} data-state={state.status} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span key={state.status} className={styles.text}>
        {label(state, isFolder(repo) ? null : branch, now, onDevice)}
      </span>
    </span>
  )
}

/** `branch` is null for a Family in a folder, kept in the browser's storage when `onDevice`. */
function label(state: SyncState, branch: string | null, now: number, onDevice: boolean): string {
  switch (state.status) {
    case 'synced':
      return branch !== null
        ? `Synced to ${branch}`
        : onDevice
          ? 'Saved on this device'
          : 'Saved to the folder'
    case 'pending': {
      if (state.due === null || branch === null) return 'Unsaved edits'
      const left = Math.max(0, Math.ceil((state.due - now) / 1000))
      return `Unsaved edits · auto-push in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
    }
    case 'saving':
      return 'Saving…'
    case 'offline':
      return 'Offline · edits kept on this device'
    case 'conflict':
      return 'Conflict · both versions kept'
    case 'error':
      return state.message
  }
}
