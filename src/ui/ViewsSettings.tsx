// Settings › Views: how this device shows a Family (design/views/README.md). The same choice as
// the switcher in the top bar; both save it per device.

import { useView, ViewIcon } from '../views/ViewSwitcher'
import { saveView, VIEW_IDS, VIEWS } from '../views/views'
import styles from './Appearance.module.css'
import own from './Settings.module.css'
import controls from './controls.module.css'
import { SettingsShell } from './Settings'

export function ViewsSettings() {
  const view = useView()
  return (
    <SettingsShell page="views">
      <main className={`${styles.main} ${own.single}`}>
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
        </div>
      </main>
    </SettingsShell>
  )
}
