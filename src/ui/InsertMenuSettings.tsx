// Settings › Insert menu (owner's request): which items the editor's insert menu (Ctrl/Cmd
// held, a long press, / on touch) shows and in what order, and blocks of the person's own
// Markdown, named, to insert from it. Saved on this device (editor/menuSetup.ts).

import { useState, useSyncExternalStore } from 'react'
import {
  DEFAULT_SETUP,
  blockKey,
  entries,
  move,
  putBlock,
  removeBlock,
  saveSetup,
  setHidden,
  setupStore,
  type Block,
} from '../editor/menuSetup'
import styles from './Appearance.module.css'
import own from './Settings.module.css'
import controls from './controls.module.css'
import { Icon } from './icons'
import { SettingsShell } from './Settings'

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function InsertMenuSettings() {
  const setup = useSyncExternalStore(setupStore.subscribe, setupStore.get)
  const list = entries(setup)
  const shownCount = list.filter((e) => !e.hidden).length
  const [draft, setDraft] = useState<Block | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (!draft) return
    if (!draft.name.trim()) return setError('Give the block a name.')
    if (!draft.text.trim()) return setError('Write what the block inserts.')
    saveSetup(putBlock(setup, { ...draft, name: draft.name.trim() }))
    setDraft(null)
    setError(null)
  }

  const remove = (block: Block) => {
    if (!window.confirm(`Delete the block “${block.name}”? Text inserted with it stays.`)) return
    if (draft?.id === block.id) setDraft(null)
    saveSetup(removeBlock(setup, block.id))
  }

  return (
    <SettingsShell page="menu">
      <main id="main" tabIndex={-1} className={`${styles.main} ${own.single}`}>
        <div>
          <h1 className={styles.title}>Insert menu</h1>
          <p className={styles.lede}>
            What the menu shows when you hold Ctrl or Cmd while writing (a long press or / on a
            touch screen), and in what order. Your own blocks of Markdown go in it too. Kept on this
            device.
          </p>

          <fieldset className={styles.group}>
            <legend className={controls.eyebrow}>Items</legend>
            <ol className={own.rows} aria-label="Menu items">
              {list.map((e, i) => {
                const block = setup.blocks.find((b) => blockKey(b.id) === e.key)
                return (
                  <li key={e.key} className={own.row} data-hidden={e.hidden || undefined}>
                    <label className={own.rowName}>
                      <input
                        type="checkbox"
                        checked={!e.hidden}
                        // The menu always keeps one item.
                        disabled={!e.hidden && shownCount === 1}
                        onChange={(ev) => saveSetup(setHidden(setup, e.key, !ev.target.checked))}
                      />{' '}
                      {e.label}
                      {block && <span className={`${controls.mono} ${own.rowPath}`}>block</span>}
                    </label>
                    <button
                      type="button"
                      className={controls.iconButton}
                      aria-label={`Move ${e.label} up`}
                      disabled={i === 0}
                      onClick={() => saveSetup(move(setup, e.key, -1))}
                    >
                      <Icon name="chevronUp" />
                    </button>
                    <button
                      type="button"
                      className={controls.iconButton}
                      aria-label={`Move ${e.label} down`}
                      disabled={i === list.length - 1}
                      onClick={() => saveSetup(move(setup, e.key, 1))}
                    >
                      <Icon name="chevronDown" />
                    </button>
                    {block && (
                      <>
                        <button
                          type="button"
                          className={controls.ghost}
                          aria-label={`Edit ${block.name}`}
                          onClick={() => {
                            setError(null)
                            setDraft(block)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={controls.ghost}
                          aria-label={`Delete ${block.name}`}
                          onClick={() => remove(block)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ol>
            <div className={own.newTemplate}>
              <button
                type="button"
                className={controls.primary}
                onClick={() => {
                  setError(null)
                  setDraft({ id: newId(), name: '', text: '' })
                }}
              >
                <Icon name="plus" />
                New block
              </button>
              <button
                type="button"
                className={controls.ghost}
                onClick={() => saveSetup({ ...DEFAULT_SETUP, blocks: setup.blocks })}
              >
                Reset order
              </button>
            </div>
          </fieldset>

          {draft && (
            <form
              className={styles.group}
              aria-label="Block"
              onSubmit={(ev) => {
                ev.preventDefault()
                save()
              }}
            >
              <label className={own.family}>
                <span className={controls.eyebrow}>Name</span>
                <input
                  className={controls.input}
                  placeholder="Meeting notes"
                  autoComplete="off"
                  autoFocus
                  value={draft.name}
                  onChange={(ev) => setDraft({ ...draft, name: ev.target.value })}
                />
              </label>
              <label className={own.family}>
                <span className={controls.eyebrow}>Markdown</span>
                <textarea
                  className={`${controls.input} ${controls.mono} ${own.blockText}`}
                  rows={8}
                  placeholder={'## Attendees\n\n- \n\n## Decisions\n\n- [ ] '}
                  value={draft.text}
                  onChange={(ev) => setDraft({ ...draft, text: ev.target.value })}
                />
              </label>
              <div className={own.newTemplate}>
                <button type="submit" className={controls.primary}>
                  Save block
                </button>
                <button type="button" className={controls.ghost} onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
              {error && (
                <p className={controls.error} role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </SettingsShell>
  )
}
