// Settings › Views: how this device shows a Family (design/views/README.md). The same choice as
// the switcher in the top bar; both save it per device.

import { useState } from 'react'
import { useView, ViewIcon } from '../views/ViewSwitcher'
import { mapOrder, saveMapOrder, saveView, VIEW_IDS, VIEWS, type MapOrder } from '../views/views'
import styles from './Appearance.module.css'
import own from './Settings.module.css'
import controls from './controls.module.css'
import { openOn, saveOpenOn, type OpenOn } from './FamilyMenu'
import { SettingsShell } from './Settings'

const OPENINGS: { id: OpenOn; label: string; note: string }[] = [
  {
    id: 'all',
    label: 'All projects',
    note: 'Every Family on one map, each in its own ring. The usual choice on a computer.',
  },
  {
    id: 'last',
    label: 'The last Family',
    note: 'The Family you were in last, on its own. The usual choice on a phone: quicker.',
  },
]

const ORDERS: { id: MapOrder; label: string; note: string }[] = [
  {
    id: 'planted',
    label: 'When planted',
    note: 'Oldest first: each leaf where it was written, a branch by its first leaf.',
  },
  { id: 'name', label: 'By name', note: 'Branches first, then leaves, A to Z.' },
]

export function ViewsSettings() {
  const view = useView()
  const [opening, setOpening] = useState(openOn)
  const [order, setOrder] = useState(() => mapOrder())
  return (
    <SettingsShell page="views">
      <main id="main" tabIndex={-1} className={`${styles.main} ${own.single}`}>
        <div>
          <h1 className={styles.title}>Views</h1>
          <p className={styles.lede}>
            How your Trees and leaves are shown. Switch any time from the top bar; this device
            remembers the last one.
          </p>
          <fieldset className={styles.group}>
            <legend className={controls.eyebrow}>Show a Family as</legend>
            <div className={own.views}>
              {VIEW_IDS.map((id) => (
                <label key={id} className={own.view}>
                  <input
                    type="radio"
                    name="view"
                    value={id}
                    checked={view === id}
                    onChange={() => saveView(id)}
                  />
                  <span className={own.viewIcon}>
                    <ViewIcon view={id} size={22} />
                  </span>
                  <span className={own.viewText}>
                    <strong>{VIEWS[id].label}</strong>
                    <span className={styles.note}>{VIEWS[id].note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend className={controls.eyebrow}>Open the app on</legend>
            {OPENINGS.map(({ id, label, note }) => (
              <label key={id} className={own.view}>
                <input
                  type="radio"
                  name="opening"
                  value={id}
                  checked={opening === id}
                  onChange={() => {
                    saveOpenOn(id)
                    setOpening(id)
                  }}
                />
                <span className={own.viewText}>
                  <strong>{label}</strong>
                  <span className={styles.note}>{note}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.group}>
            <legend className={controls.eyebrow}>Order on the map</legend>
            {ORDERS.map(({ id, label, note }) => (
              <label key={id} className={own.view}>
                <input
                  type="radio"
                  name="order"
                  value={id}
                  checked={order === id}
                  onChange={() => {
                    saveMapOrder(id)
                    setOrder(id)
                  }}
                />
                <span className={own.viewText}>
                  <strong>{label}</strong>
                  <span className={styles.note}>{note}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </main>
    </SettingsShell>
  )
}
