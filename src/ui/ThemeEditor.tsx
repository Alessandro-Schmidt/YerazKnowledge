import { useEffect, useRef, useState } from 'react'
import { slugify } from '../model/slug'
import styles from './Appearance.module.css'
import controls from './controls.module.css'
import { parseTheme, resolveCustom, themeFrom, type CustomTheme } from './customTheme'
import { ACCENT_IDS, resolveTokens, type AccentId, type ThemeChoice } from './theme'

// Settings › Appearance › Custom theme (ARCHITECTURE.md §13, development-plan.md After
// launch): start from the current theme, import a file, or pick a community theme from
// themes/; edit any colour with live contrast checks; export it to share.

const LABELS: Record<string, string> = {
  accent: 'Accent',
  bg: 'Page',
  top: 'Top bar',
  panel: 'Panels',
  raised: 'Raised',
  hover: 'Hover',
  hair: 'Hairlines',
  'hair-strong': 'Strong lines',
  text: 'Text',
  'text-body': 'Leaf text',
  muted: 'Secondary text',
  faint: 'Faint text',
  node: 'Map dots',
  line: 'Map lines',
  core: 'Map core',
  'on-accent': 'Text on accent',
}
const EDITABLE = Object.keys(LABELS)

/** Every theme in themes/, loaded when this screen opens. */
const community = import.meta.glob<string>('../../themes/*.json', {
  query: '?raw',
  import: 'default',
})

export function CustomThemeEditor({
  theme,
  current,
  onChange,
}: {
  theme: CustomTheme | null
  /** The built-in choice on screen, for "Create from current". */
  current(): ThemeChoice
  onChange(theme: CustomTheme | null): void
}) {
  const [shared, setShared] = useState<CustomTheme[]>([])
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let live = true
    void Promise.all(
      Object.values(community).map((load) =>
        load().then(
          (raw) => parseTheme(raw),
          () => null,
        ),
      ),
    ).then((themes) => live && setShared(themes.filter((t): t is CustomTheme => t !== null)))
    return () => {
      live = false
    }
  }, [])

  const pick = (next: CustomTheme | null) => {
    setError(null)
    onChange(next)
  }

  const importFile = async (picked: File | undefined) => {
    if (!picked) return
    try {
      pick(parseTheme(await picked.text()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const exportTheme = (t: CustomTheme) => {
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(t, null, 2)}\n`], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${slugify(t.name) || 'theme'}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <fieldset className={styles.group}>
      <legend className={controls.eyebrow}>Custom theme</legend>
      {theme ? (
        <Editor theme={theme} onChange={pick} onExport={() => exportTheme(theme)} />
      ) : (
        <>
          <p className={styles.note}>
            Start from the theme above and change any colour. A colour that would be hard to read is
            adjusted until it passes.
          </p>
          <div className={styles.customButtons}>
            <button
              type="button"
              className={controls.ghost}
              onClick={() => pick(themeFrom(current()))}
            >
              Create from current
            </button>
            <button type="button" className={controls.ghost} onClick={() => file.current?.click()}>
              Import…
            </button>
          </div>
          {shared.length > 0 && (
            <div className={styles.community}>
              <p className={controls.eyebrow}>From the community</p>
              <div className={styles.communityList}>
                {shared.map((t) => {
                  const { tokens } = resolveCustom(t)
                  return (
                    <button
                      key={t.name}
                      type="button"
                      className={styles.communityTheme}
                      onClick={() => pick(t)}
                    >
                      <span className={styles.swatches} aria-hidden="true">
                        {[tokens.bg, tokens.panel, tokens.text, tokens.accent].map((c, i) => (
                          <span key={i} style={{ background: c }} />
                        ))}
                      </span>
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Choose a theme file"
        onChange={(e) => {
          void importFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && (
        <p className={controls.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function Editor({
  theme,
  onChange,
  onExport,
}: {
  theme: CustomTheme
  onChange(theme: CustomTheme | null): void
  onExport(): void
}) {
  const { adjusted } = resolveCustom(theme)
  // What the theme asks for (before any adjustment), so the pickers show the user's colours.
  const named = resolveTokens(theme.base, 'green')
  const asked = (name: string) =>
    name === 'accent'
      ? (ACCENT_IDS as string[]).includes(theme.accent)
        ? resolveTokens(theme.base, theme.accent as AccentId).accent
        : theme.accent
      : (theme.tokens[name] ?? named[name]!)
  const set = (name: string, value: string) =>
    onChange(
      name === 'accent'
        ? { ...theme, accent: value.toUpperCase() }
        : { ...theme, tokens: { ...theme.tokens, [name]: value.toUpperCase() } },
    )
  return (
    <div className={styles.customEditor}>
      <label className={styles.customName}>
        <span className={styles.note}>Name</span>
        <input
          className={controls.input}
          value={theme.name}
          maxLength={60}
          onChange={(e) => onChange({ ...theme, name: e.target.value })}
        />
      </label>
      <div className={styles.tokens}>
        {EDITABLE.map((name) => (
          <label key={name} className={styles.token}>
            <input type="color" value={asked(name)} onChange={(e) => set(name, e.target.value)} />
            {LABELS[name]}
          </label>
        ))}
      </div>
      <p className={styles.note} role="status">
        {adjusted.length
          ? `Adjusted to stay readable: ${adjusted
              .map((a) => `${LABELS[a.token] ?? a.token} ${a.from} → ${a.to}`)
              .join(', ')}.`
          : 'Every colour passes the contrast rules.'}
      </p>
      <div className={styles.customButtons}>
        <button type="button" className={controls.ghost} onClick={onExport}>
          Export
        </button>
        <button type="button" className={controls.ghost} onClick={() => onChange(null)}>
          Stop using it
        </button>
      </div>
    </div>
  )
}
