// A name that becomes a text field when clicked: rename something where it is shown,
// without a dialog (issue #18). Enter or leaving the field saves; Escape cancels.

import { useId, useRef, useState } from 'react'
import styles from './InlineName.module.css'

export function InlineName({
  value,
  label,
  onRename,
}: {
  value: string
  /** What the field is for, e.g. "Tree name". */
  label: string
  /** Saves the new name; a thrown message is shown and the field stays open. */
  onRename(name: string): Promise<void>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  // Escape closes the field; the blur that follows must not save it.
  const cancelled = useRef(false)

  const save = async (text: string) => {
    if (cancelled.current) return
    const name = text.replace(/\s+/g, ' ').trim()
    setDraft(null)
    if (name === value) return setError(null)
    setSaving(name)
    try {
      await onRename(name)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDraft(text)
    } finally {
      setSaving(null)
    }
  }

  if (draft === null) {
    return (
      <button
        type="button"
        className={styles.name}
        title={`Rename · ${label}`}
        onClick={() => {
          cancelled.current = false
          setDraft(saving ?? value)
        }}
      >
        {saving ?? value}
      </button>
    )
  }
  return (
    <span className={styles.editing}>
      <input
        className={styles.input}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoFocus
        spellCheck={false}
        size={Math.max(4, draft.length + 1)}
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            // Only the field closes, not the panel or dialog around it.
            e.stopPropagation()
            cancelled.current = true
            setError(null)
            setDraft(null)
          }
        }}
      />
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
