// The view switcher (design/views/README.md): a segmented control in the top bar on wide
// screens, a row of tabs under it that scrolls sideways on phones. Choosing a view saves
// it for this device (views.ts).

import { useSyncExternalStore } from 'react'
import styles from './ViewSwitcher.module.css'
import { saveView, VIEW_ICONS, VIEW_IDS, VIEWS, viewStore, type ViewId } from './views'

export function ViewIcon({ view, size = 15 }: { view: ViewId; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={VIEW_ICONS[view]} />
    </svg>
  )
}

/** The view shown on this device, re-rendering when it changes anywhere. */
export const useView = (): ViewId => useSyncExternalStore(viewStore.subscribe, viewStore.get)

export function ViewSwitcher({ phone = false }: { phone?: boolean }) {
  const view = useView()
  const group = (
    <div
      className={phone ? styles.row : styles.bar}
      role="radiogroup"
      aria-label="View"
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        e.preventDefault()
        const next = VIEW_IDS[(VIEW_IDS.indexOf(view) + step + VIEW_IDS.length) % VIEW_IDS.length]!
        saveView(next)
        e.currentTarget.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus()
      }}
    >
      {VIEW_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={view === id}
          tabIndex={view === id ? 0 : -1}
          data-view={id}
          className={styles.tab}
          title={VIEWS[id].label}
          ref={(el) => {
            // On a phone the chosen tab scrolls into the row, as on design/views/screens/12.
            if (phone && el && view === id)
              el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          }}
          onClick={() => saveView(id)}
        >
          <ViewIcon view={id} />
          <span className={styles.label}>{VIEWS[id].label}</span>
        </button>
      ))}
    </div>
  )
  // On a phone the row is its own landmark, between the top bar and the Family.
  return phone ? <nav aria-label="Views">{group}</nav> : group
}
