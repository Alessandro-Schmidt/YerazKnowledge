import { useEffect, useRef, useState } from 'react'
import controls from '../ui/controls.module.css'
import styles from './EditorPage.module.css'

// A short, useful set; any emoji typed at the start of the title works too.
const ICONS = [
  '📚',
  '🧠',
  '🔐',
  '⚙️',
  '🧪',
  '🧬',
  '📈',
  '🧭',
  '🗺️',
  '🌍',
  '🌱',
  '🌳',
  '🪐',
  '🔭',
  '💡',
  '🛠️',
  '🎨',
  '🎼',
  '🎬',
  '📷',
  '✍️',
  '📝',
  '📌',
  '🗂️',
  '💬',
  '🧩',
  '🧱',
  '🚀',
  '🏛️',
  '⚖️',
  '🩺',
  '🍳',
  '👩‍💻',
  '🧑‍🏫',
  '🇧🇷',
  '🇯🇵',
  '🇫🇷',
  '🇩🇪',
  '⭐',
  '🔥',
]

export function IconPicker({
  icon,
  onPick,
}: {
  icon: string | null
  onPick(icon: string | null): void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const pick = (value: string | null) => {
    onPick(value)
    setOpen(false)
  }

  return (
    <div className={styles.iconRow} ref={box}>
      <button
        type="button"
        className={styles.iconButton}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon ? <span className={styles.icon}>{icon}</span> : 'Add icon'}
      </button>
      {open && (
        <div className={`${controls.panel} ${styles.picker}`} role="group" aria-label="Icons">
          {ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.emoji}
              aria-label={`Use ${emoji}`}
              onClick={() => pick(emoji)}
            >
              {emoji}
            </button>
          ))}
          {icon && (
            <button
              type="button"
              className={`${controls.ghost} ${styles.removeIcon}`}
              onClick={() => pick(null)}
            >
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  )
}
