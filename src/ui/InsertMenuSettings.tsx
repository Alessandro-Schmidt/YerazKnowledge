// Settings › Insert menu (owner's request): which items the editor's insert menu (Ctrl/Cmd
// held, a long press, / on touch) shows and in what order, and blocks of the person's own
// Markdown, named, to insert from it. Saved on this device (editor/menuSetup.ts).

import { useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
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
  // While an item is dragged, the list shows it where it would land; saved on release.
  const [drag, setDrag] = useState<{ key: string; order: string[] } | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const all = entries(setup)
  const list = drag ? drag.order.map((k) => all.find((e) => e.key === k)!) : all

  const grab = (ev: PointerEvent<HTMLButtonElement>, key: string) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    setDrag({ key, order: all.map((e) => e.key) })
  }
  // The dragged item goes before the first other item whose middle is below the pointer.
  const over = (ev: PointerEvent) => {
    if (!drag || !listRef.current) return
    const others = [...listRef.current.children].filter(
      (li) => (li as HTMLElement).dataset.key !== drag.key,
    ) as HTMLElement[]
    let at = others.findIndex((li) => {
      const r = li.getBoundingClientRect()
      return ev.clientY < r.top + r.height / 2
    })
    if (at < 0) at = others.length
    const order = others.map((li) => li.dataset.key!)
    order.splice(at, 0, drag.key)
    if (order.some((k, j) => k !== drag.order[j])) setDrag({ ...drag, order })
  }
  const drop = () => {
    if (!drag) return
    const from = all.findIndex((e) => e.key === drag.key)
    const to = drag.order.indexOf(drag.key)
    if (to !== from) saveSetup(move(setup, drag.key, to - from))
    setDrag(null)
  }
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
            <ol ref={listRef} className={own.rows} aria-label="Menu items">
              {list.map((e, i) => {
                const block = setup.blocks.find((b) => blockKey(b.id) === e.key)
                return (
                  <li
                    key={e.key}
                    data-key={e.key}
                    className={own.row}
                    data-hidden={e.hidden || undefined}
                    data-dragging={drag?.key === e.key || undefined}
                  >
                    <button
                      type="button"
                      className={`${controls.iconButton} ${own.grip}`}
                      aria-label={`Reorder ${e.label}`}
                      title="Drag to reorder (or the arrow keys)"
                      onPointerDown={(ev) => grab(ev, e.key)}
                      onPointerMove={over}
                      onPointerUp={drop}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={(ev) => {
                        const by = { ArrowUp: -1, ArrowDown: 1 }[ev.key]
                        if (!by || i + by < 0 || i + by >= list.length) return
                        ev.preventDefault()
                        saveSetup(move(setup, e.key, by))
                      }}
                    >
                      <Icon name="grip" size={18} />
                    </button>
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
