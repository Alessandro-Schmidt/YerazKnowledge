import { useEffect, useMemo, useRef, useState } from 'react'
import controls from '../ui/controls.module.css'
import { GROUPS, loadEmoji, searchEmoji, type Emoji } from './emoji'
import styles from './LeafEditor.module.css'

// Every emoji, searchable by name and keyword; any emoji typed at the start of the title
// works too. The page opens it from "Add icon" or the icon itself: buttons marked
// data-icon-trigger, which toggle it rather than count as a click outside. An icon (an emoji
// or an image) is removed from beside the search, where it is always in sight.

export function IconPicker({
  removable,
  onPick,
  onClose,
}: {
  /** The page has an icon to remove. */
  removable: boolean
  onPick(icon: string | null): void
  onClose(): void
}) {
  const [all, setAll] = useState<Emoji[] | null>(null)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!all) void loadEmoji().then(setAll)
  }, [all])
  const found = useMemo(() => (all && query.trim() ? searchEmoji(query, all) : null), [all, query])
  const groups = useMemo(() => {
    const byGroup = new Map<number, Emoji[]>()
    for (const e of all ?? []) byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e])
    return [...byGroup]
  }, [all])
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const target = e.target as Element
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !box.current?.contains(target) && !target.closest?.('[data-icon-trigger]')
      )
        onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [onClose])

  const pick = (value: string | null) => {
    onPick(value)
    onClose()
  }
  const button = (e: Emoji) => (
    <button
      key={e.emoji}
      type="button"
      className={styles.emoji}
      aria-label={e.label}
      title={e.label}
      onClick={() => pick(e.emoji)}
    >
      {e.emoji}
    </button>
  )

  return (
    <div ref={box} className={`${controls.panel} ${styles.picker}`} role="group" aria-label="Icons">
      <div className={styles.pickerTop}>
        <input
          type="search"
          className={`${controls.input} ${styles.emojiSearch}`}
          placeholder="Search emoji"
          aria-label="Search emoji"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && found?.[0]) pick(found[0].emoji)
          }}
        />
        {removable && (
          <button
            type="button"
            className={`${controls.ghost} ${styles.removeIcon}`}
            onClick={() => pick(null)}
          >
            Remove icon
          </button>
        )}
      </div>
      <div className={styles.emojiList}>
        {!all ? (
          <p className={styles.emojiNote}>Loading…</p>
        ) : found ? (
          found.length ? (
            <div className={styles.emojiGrid}>{found.map(button)}</div>
          ) : (
            <p className={styles.emojiNote}>No emoji for “{query.trim()}”</p>
          )
        ) : (
          groups.map(([group, list]) => (
            <section key={group} className={styles.emojiGroup} aria-label={GROUPS[group]}>
              <h2 className={controls.eyebrow}>{GROUPS[group]}</h2>
              <div className={styles.emojiGrid}>{list.map(button)}</div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
