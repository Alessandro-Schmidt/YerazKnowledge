// Settings › Tree colours: the Family's colour and each Tree's, as colour names written
// to the repository's `.yeraz.json` (ARCHITECTURE.md §4, §13), so every device shows the
// same. Names follow the theme: an amber Tree is the theme's amber on every base.

import { useEffect, useState } from 'react'
import themes from '../../design/themes/themes.json'
import type { TreeRef } from '../github/graphql'
import { treesOf } from '../map/family'
import { session, useSession } from '../store/session'
import { lastFamily } from './FamilyMenu'
import styles from './Appearance.module.css'
import own from './Settings.module.css'
import controls from './controls.module.css'
import { SettingsShell } from './Settings'
import { ACCENT_IDS } from './theme'

export function TreeColours() {
  const trees = useSession((s) => s.trees)
  const [chosen, setChosen] = useState<string | null>(null)
  const last = lastFamily()?.toLowerCase()
  const family =
    trees.find((t) => t.repo.toLowerCase() === (chosen ?? last)) ?? trees[0] ?? undefined

  return (
    <SettingsShell page="colours">
      <main id="main" tabIndex={-1} className={`${styles.main} ${own.single}`}>
        <div>
          <h1 className={styles.title}>Tree colours</h1>
          <p className={styles.lede}>
            Saved in the Family’s repository, so every device shows the same colours. The interface
            colours are under Appearance.
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
            <FamilyColours key={family.repo} family={family} />
          ) : (
            <p className={styles.note}>Connect a Family first.</p>
          )}
        </div>
      </main>
    </SettingsShell>
  )
}

function FamilyColours({ family }: { family: TreeRef }) {
  const key = family.repo.toLowerCase()
  const graph = useSession((s) => s.data[key]?.graph ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => void session.getState().open(family.repo), [family.repo])

  const set = (color: string | null, tree?: string) => {
    setError(null)
    session
      .getState()
      .setColor(family.repo, color, tree)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <>
      <fieldset className={styles.group}>
        <legend className={controls.eyebrow}>Family colour</legend>
        <Swatches
          name={`family-${key}`}
          label={family.title}
          value={family.color}
          fallback="Accent"
          fallbackColor="var(--accent)"
          onChange={(c) => set(c)}
        />
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={controls.eyebrow}>Each Tree</legend>
        {!graph ? (
          <p className={styles.note} aria-busy="true">
            Opening the Family…
          </p>
        ) : (
          <div className={own.rows}>
            {treesOf(graph).map((id) => (
              <Swatches
                key={id}
                name={`tree-${key}-${id}`}
                label={graph.nodes.get(id)!.title}
                value={family.trees?.[id] ?? null}
                fallback="Family"
                fallbackColor={family.color ? `var(--c-${family.color})` : 'var(--accent)'}
                onChange={(c) => set(c, id)}
              />
            ))}
          </div>
        )}
        {error && (
          <p className={controls.error} role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </>
  )
}

/** One row: a name and its colour choices, the first being "inherit". */
function Swatches({
  name,
  label,
  value,
  fallback,
  fallbackColor,
  onChange,
}: {
  name: string
  label: string
  value: string | null
  fallback: string
  fallbackColor: string
  onChange(color: string | null): void
}) {
  const known = value !== null && (ACCENT_IDS as string[]).includes(value) ? value : null
  return (
    <div className={own.row} role="radiogroup" aria-label={`${label} colour`}>
      <span className={own.rowName}>{label}</span>
      <div className={own.swatches}>
        <label className={own.swatch} title={`${fallback} colour`}>
          <input
            type="radio"
            name={name}
            checked={known === null}
            onChange={() => onChange(null)}
            aria-label={fallback}
          />
          <span className={own.dot} data-inherit="" style={{ background: fallbackColor }} />
        </label>
        {ACCENT_IDS.map((id) => (
          <label key={id} className={own.swatch} title={themes.accents[id].name}>
            <input
              type="radio"
              name={name}
              checked={known === id}
              onChange={() => onChange(id)}
              aria-label={themes.accents[id].name}
            />
            <span className={own.dot} style={{ background: `var(--c-${id})` }} />
          </label>
        ))}
      </div>
    </div>
  )
}
