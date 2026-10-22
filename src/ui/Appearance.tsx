import { useEffect, useRef, useState, type CSSProperties } from 'react'
import themes from '../../design/themes/themes.json'
import styles from './Appearance.module.css'
import controls from './controls.module.css'
import { Icon } from './icons'
import { CustomThemeEditor } from './ThemeEditor'
import { applyCustom, savedCustom, saveCustom, type CustomTheme } from './customTheme'
import {
  ACCENT_IDS,
  applyTheme,
  BASE_IDS,
  FONT_IDS,
  fontStack,
  modeOf,
  saveTheme,
  type AccentId,
  type BaseId,
  type ThemeChoice,
} from './theme'
import { SettingsShell } from './Settings'

// Settings › Appearance (design/screens/09, 10). The choices are native radio inputs, so
// switching changes four attributes on <html> and nothing in React re-renders, not even
// this screen: CSS shows the checked card, and the preview label is written directly.
// Below them, a custom theme (ThemeEditor.tsx) overrides colours on top of the choice.

const BASE_NOTES: Record<BaseId, string> = {
  vanta: 'Dark · default',
  graphite: 'Softer dark',
  paper: 'Light, for long reading',
}
const FONT_NOTES: Record<string, string> = {
  geist: 'Sans · default',
  serif: 'Serif · for long notes',
}
const SAMPLE = 'Women slap thin dough against the hot walls of a tonir.'

const current = (): ThemeChoice => {
  const { base, accent, font } = document.documentElement.dataset
  return { base, accent, font } as ThemeChoice
}
const label = ({ base, accent }: ThemeChoice) =>
  `${themes.bases[base].name} · ${themes.accents[accent].name} · contrast AA`

/** A base card draws in its own base, whatever is on screen, with the current accent. */
const baseStyle = (base: BaseId) => {
  const mode = modeOf(base)
  return {
    ...Object.fromEntries(
      Object.entries(themes.bases[base].tokens).map(([name, value]) => [`--${name}`, value]),
    ),
    ...Object.fromEntries(ACCENT_IDS.map((id) => [`--a-${id}`, themes.accents[id][mode]])),
  } as CSSProperties
}

export function Appearance() {
  const status = useRef<HTMLSpanElement>(null)
  const [initial] = useState(current)
  const [custom, setCustom] = useState(savedCustom)

  // Show the serif in its card even before anyone picks it.
  useEffect(() => void import('@fontsource-variable/newsreader'), [])

  const choose = (part: keyof ThemeChoice, value: string) => {
    const choice = { ...current(), [part]: value }
    // A built-in choice leaves the custom theme; only then does this screen re-render.
    if (custom) chooseCustom(null)
    applyTheme(choice)
    saveTheme(choice)
    status.current!.textContent = label(choice)
  }

  const chooseCustom = (theme: CustomTheme | null) => {
    const kept = theme && { ...theme, name: theme.name.trim() || 'My theme' }
    setCustom(theme)
    applyCustom(kept)
    saveCustom(kept)
    // Every radio of the group is set, not only the new one: React tracks each radio's
    // checked state, and one unchecked behind its back would never report a change again.
    if (kept)
      for (const [name, value] of [
        ['base', kept.base],
        ['font', kept.font],
      ] as const)
        for (const radio of document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
          radio.checked = radio.value === value
    status.current!.textContent = kept ? `${kept.name} · custom · contrast AA` : label(current())
  }

  return (
    <SettingsShell page="appearance">
      <main className={styles.main}>
        <div>
          <h1 className={styles.title}>Appearance</h1>
          <p className={styles.lede}>Changes apply right away on this device.</p>

          <fieldset className={styles.group}>
            <legend className={controls.eyebrow}>Base</legend>
            <div className={styles.bases}>
              {BASE_IDS.map((id) => (
                <label key={id} className={styles.base}>
                  <input
                    type="radio"
                    name="base"
                    value={id}
                    defaultChecked={initial.base === id}
                    onChange={() => choose('base', id)}
                  />
                  <span className={styles.mini} style={baseStyle(id)} aria-hidden="true">
                    <span className={styles.miniTop} />
                    <span className={styles.miniSide} />
                    <MiniMap className={styles.miniMap} />
                  </span>
                  <strong>{themes.bases[id].name}</strong>
                  <span className={styles.note}>{BASE_NOTES[id]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={controls.eyebrow}>Accent</legend>
            <div className={styles.accents}>
              {ACCENT_IDS.map((id: AccentId) => (
                <label key={id} className={styles.accent}>
                  <input
                    type="radio"
                    name="accent"
                    value={id}
                    defaultChecked={initial.accent === id}
                    onChange={() => choose('accent', id)}
                  />
                  <span className={styles.swatch} style={{ background: `var(--c-${id})` }} />
                  {themes.accents[id].name}
                </label>
              ))}
            </div>
            <p className={styles.note}>
              Tree and leaf colours are named colours, so they follow whichever base you pick.
            </p>
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={controls.eyebrow}>Reading font</legend>
            <div className={styles.fonts}>
              {FONT_IDS.map((id) => (
                <label key={id} className={styles.font}>
                  <input
                    type="radio"
                    name="font"
                    value={id}
                    defaultChecked={initial.font === id}
                    onChange={() => choose('font', id)}
                  />
                  <span
                    className={styles.aa}
                    style={{ fontFamily: fontStack(id) }}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  <span className={styles.fontText}>
                    <strong>{themes.fonts[id].name}</strong>
                    <span className={styles.note}>{FONT_NOTES[id]}</span>
                    <span className={styles.sample} style={{ fontFamily: fontStack(id) }}>
                      {SAMPLE}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <CustomThemeEditor theme={custom} current={current} onChange={chooseCustom} />
        </div>

        <section aria-label="Preview">
          <div className={styles.previewHead}>
            <p className={controls.eyebrow}>Preview</p>
            <span className={styles.status}>
              <Icon name="check" size={13} />{' '}
              <span ref={status}>
                {custom ? `${custom.name} · custom · contrast AA` : label(initial)}
              </span>
            </span>
          </div>
          <div className={`${controls.panel} ${styles.previewCard}`}>
            <MiniMap className={styles.previewMap} />
            <div className={styles.leaf}>
              <p className={styles.kind}>
                <span>Leaf</span>
                <span className={controls.mono}>Kitchen / Breads</span>
              </p>
              <h2>🫓 Lavash</h2>
              <div className="reading">
                <p>
                  {SAMPLE.slice(0, -1)}, a craft UNESCO listed in 2014 as{' '}
                  <span className="mention">@ Intangible heritage</span>.
                </p>
                <h3>How it keeps</h3>
                <p>Dried sheets last for months, and a sprinkle of water softens them again.</p>
              </div>
              <div className={styles.buttons} aria-hidden="true">
                <span className={controls.primary}>New leaf</span>
                <span className={controls.ghost}>Add cover</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </SettingsShell>
  )
}

/** The small map drawn in the base cards and the preview: a core, two branches, a thread. */
function MiniMap({ className }: { className?: string }) {
  return (
    <svg className={`${styles.map} ${className}`} viewBox="0 0 160 110" aria-hidden="true">
      <path
        className={styles.edge}
        d="M80 52L36 14M80 52L118 82M80 52L52 98M118 82L142 92M36 14L18 20"
      />
      <path className={styles.branch} d="M18 20Q60 38 92 34Q118 30 142 18M44 98Q90 70 142 46" />
      <circle className={styles.core} cx="80" cy="52" r="9" />
      <circle className={styles.ring} cx="80" cy="52" r="13" />
      {[
        [56, 30],
        [104, 32],
        [92, 84],
      ].map(([x, y]) => (
        <circle key={`${x}`} className={styles.hollow} cx={x} cy={y} r="4.5" />
      ))}
      {[
        [18, 20, 3.5],
        [36, 10, 2.5],
        [142, 46, 3],
        [44, 98, 3],
        [120, 96, 3.5],
      ].map(([x, y, r]) => (
        <circle key={`${x}`} className={styles.dot} cx={x} cy={y} r={r} />
      ))}
      <circle className={styles.hot} cx="142" cy="18" r="5" />
    </svg>
  )
}
