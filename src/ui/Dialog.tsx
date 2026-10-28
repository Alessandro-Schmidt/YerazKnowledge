import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import controls from './controls.module.css'
import styles from './Dialog.module.css'

/** A modal form on the native <dialog>: focus stays inside, Escape closes it. */
export function Dialog({
  title,
  children,
  submit,
  danger,
  busy,
  error,
  extra,
  onSubmit,
  onClose,
}: {
  title: string
  children: ReactNode
  submit: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  /** A second way out, between Cancel and `submit`: a stronger step the person may want instead. */
  extra?: { label: string; onClick(): void }
  onSubmit(): void
  onClose(): void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    if (!dialog.open) dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="dialog-title"
      // StrictMode closes and reopens on mount; the late close event finds it open again.
      onClose={() => {
        if (!ref.current?.open) onClose()
      }}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <form
        className={styles.form}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <h2 id="dialog-title" className={styles.title}>
          {title}
        </h2>
        {children}
        {error && (
          <p className={controls.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.buttons}>
          <button type="button" className={controls.ghost} onClick={onClose}>
            Cancel
          </button>
          {extra && (
            <button
              type="button"
              className={`${controls.ghost} ${styles.extra}`}
              disabled={busy}
              onClick={extra.onClick}
            >
              {extra.label}
            </button>
          )}
          <button
            type="submit"
            className={danger ? `${controls.primary} ${styles.danger}` : controls.primary}
            disabled={busy}
          >
            {busy ? 'Working…' : submit}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className={styles.field}>
      <span className={controls.eyebrow}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  )
}
