// Settings › Hidden: what was hidden from a Family's map (owner's request), and a button to
// show each one again. Hiding is in the Peek's ⋯ menu; it is written to the leaf's line 2
// (or the branch's README.md), so every device hides the same.

import { useEffect, useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { session, useSession } from '../store/session'
import { lastFamily } from './FamilyMenu'
import styles from './Appearance.module.css'
import own from './Settings.module.css'
import controls from './controls.module.css'
import { SettingsShell } from './Settings'

export function Hidden() {
  const trees = useSession((s) => s.trees)
  const [chosen, setChosen] = useState<string | null>(null)
  const last = lastFamily()?.toLowerCase()
  const family =
    trees.find((t) => t.repo.toLowerCase() === (chosen ?? last)) ?? trees[0] ?? undefined

  return (
    <SettingsShell page="hidden">
      <main id="main" tabIndex={-1} className={`${styles.main} ${own.single}`}>
        <div>
          <h1 className={styles.title}>Hidden</h1>
          <p className={styles.lede}>
            Leaves, branches and Trees hidden from the map, with everything under them. Hide one
            from its Options menu; it is written to the note itself, so every device hides the same.
          </p>
          {trees.length > 1 && (
            <label className={own.family}>
              <span className={controls.eyebrow}>Family</span>
              <select
                className={controls.input}
                value={family?.repo ?? ''}
                onChange={(e) => setChosen(e.target.value.toLowerCase())}
              >
                {trees.map((t) => (
                  <option key={t.repo} value={t.repo}>
                    {t.title} · {t.repo}
                  </option>
                ))}
              </select>
            </label>
          )}
          {family ? (
            <HiddenList key={family.repo} family={family} />
          ) : (
            <p className={styles.note}>Connect a Family first.</p>
          )}
        </div>
      </main>
    </SettingsShell>
  )
}

function HiddenList({ family }: { family: TreeRef }) {
  const key = family.repo.toLowerCase()
  const graph = useSession((s) => s.data[key]?.graph ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => void session.getState().open(family.repo), [family.repo])

  const show = (id: string) => {
    setError(null)
    session
      .getState()
      .setHidden(family.repo, id, false)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <fieldset className={styles.group}>
      <legend className={controls.eyebrow}>Hidden in {family.title}</legend>
      {!graph ? (
        <p className={styles.note} aria-busy="true">
          Opening the Family…
        </p>
      ) : graph.hidden.length === 0 ? (
        <p className={styles.note}>Nothing is hidden.</p>
      ) : (
        <div className={own.rows}>
          {graph.hidden.map((h) => (
            <div key={h.id} className={own.row}>
              <span className={own.rowName}>
                {h.icon ? `${h.icon} ` : ''}
                {h.title}
                <span className={`${controls.mono} ${own.rowPath}`}>
                  {h.kind === 'branch' ? `${h.id}/` : h.id}
                </span>
              </span>
              <button type="button" className={controls.ghost} onClick={() => show(h.id)}>
                Show
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className={controls.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
