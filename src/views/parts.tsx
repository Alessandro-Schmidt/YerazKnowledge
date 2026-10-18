// Small pieces the views share.

import styles from './parts.module.css'

/** The thread mark next to a count (design/views/generators/outline.py, THREAD_IC). */
export function ThreadIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      className={styles.threadIcon}
    >
      <path d="M3.5 18c7 0 6-12 17-12" />
    </svg>
  )
}

/** A short curve in the Tree's colour: a thread in a list. */
export function ThreadCurve({ dashed = false }: { dashed?: boolean }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" className={styles.curve}>
      <path d="M1 11C7 11 8 1 21 1" data-dashed={dashed || undefined} />
    </svg>
  )
}
