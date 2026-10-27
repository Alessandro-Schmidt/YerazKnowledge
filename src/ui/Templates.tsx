// Settings › Templates (issue #41): what a Family keeps in `.yeraz/templates/` for new
// leaves. A template is a note like any other, edited here in the leaf's own editor, so it
// is committed, synced and shared as the notes are: every device and everyone sharing the
// repository (or the folder) has it. One can be copied to another Family, so it travels
// with that repository too. New leaf offers them under "Start from".

import { useEffect, useState } from 'react'
import { LeafEditor } from '../editor/LeafEditor'
import type { TreeRef } from '../github/graphql'
import type { Template } from '../model/graph'
import { session, useSession } from '../store/session'
import { planTemplate } from '../sync/structure'
import { lastFamily } from './FamilyMenu'
import styles from './Appearance.module.css'
import own from './Settings.module.css'
import controls from './controls.module.css'
import { Icon } from './icons'
import { treeHref } from './paths'
import { SettingsShell } from './Settings'

export function Templates({ repo, path }: { repo?: string; path?: string }) {
  const trees = useSession((s) => s.trees)
  const [chosen, setChosen] = useState<string | null>(repo?.toLowerCase() ?? null)
  const last = lastFamily()?.toLowerCase()
  const family =
    trees.find((t) => t.repo.toLowerCase() === (chosen ?? last)) ?? trees[0] ?? undefined

  return (
    <SettingsShell page="templates">
      <main id="main" tabIndex={-1} className={`${styles.main} ${own.single}`}>
        <div>
          <h1 className={styles.title}>Templates</h1>
          <p className={styles.lede}>
            What a new leaf can start from. A template is a note kept in the Family's{' '}
            <code>.yeraz/templates/</code> folder, so every device and everyone sharing the Family
            has it. Its title is its name, its emoji and look go to the leaf, and{' '}
            <code>{'{{title}}'}</code>, <code>{'{{date}}'}</code> and <code>{'{{tree}}'}</code> are
            filled in.
          </p>
          {trees.length > 1 && (
            <label className={own.family}>
              <span className={controls.eyebrow}>Family</span>
              <select
                className={controls.input}
                aria-label="Family"
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
            <TemplateList
              key={family.repo}
              family={family}
              others={trees.filter((t) => t.repo !== family.repo)}
              open={repo?.toLowerCase() === family.repo.toLowerCase() ? path : undefined}
            />
          ) : (
            <p className={styles.note}>Connect a Family first.</p>
          )}
        </div>
      </main>
    </SettingsShell>
  )
}

function TemplateList({
  family,
  others,
  open,
}: {
  family: TreeRef
  /** The other connected Families, a template can be copied to. */
  others: TreeRef[]
  /** A template to open in the editor at once: just saved from a leaf. */
  open: string | undefined
}) {
  const key = family.repo.toLowerCase()
  const graph = useSession((s) => s.data[key]?.graph ?? null)
  const [editing, setEditing] = useState<string | null>(open ?? null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => void session.getState().open(family.repo), [family.repo])

  const run = (work: () => Promise<void>) => {
    setError(null)
    setNotice(null)
    work().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  const make = () =>
    run(async () => {
      if (!graph) return
      if (!name.trim()) throw new Error('Give the template a name.')
      const change = planTemplate(graph, name)
      await session.getState().apply(family.repo, [change])
      setName('')
      setNaming(false)
      setEditing(change.path)
    })

  // The copy is a template of the other Family, named as this one: it travels with that
  // repository from then on; the two are not kept in step.
  const copy = (template: Template, to: TreeRef) =>
    run(async () => {
      const { getState } = session
      await getState().open(to.repo)
      const there = getState().data[to.repo.toLowerCase()]?.graph
      if (!there) throw new Error(`${to.title} couldn't be opened.`)
      const text = await getState().textOf(family.repo, template.path)
      await getState().apply(to.repo, [planTemplate(there, template.title, text)])
      setNotice(`Copied to ${to.title}.`)
    })

  const remove = (template: Template) =>
    run(async () => {
      if (!window.confirm(`Delete the template “${template.title}”? Leaves made from it stay.`))
        return
      if (editing === template.path) setEditing(null)
      await session.getState().apply(family.repo, [{ path: template.path, text: null }])
    })

  const current = editing !== null ? graph?.templates.find((t) => t.path === editing) : undefined

  return (
    <>
      <fieldset className={styles.group}>
        <legend className={controls.eyebrow}>Templates in {family.title}</legend>
        {!graph ? (
          <p className={styles.note} aria-busy="true">
            Opening the Family…
          </p>
        ) : graph.templates.length === 0 ? (
          <p className={styles.note}>
            No templates yet. Make one here, or save a leaf as one from its ⋯ menu.
          </p>
        ) : (
          <div className={own.rows}>
            {graph.templates.map((t) => (
              <div key={t.path} className={own.row}>
                <span className={own.rowName}>
                  {t.icon ? `${t.icon} ` : ''}
                  {t.title}
                  <span className={`${controls.mono} ${own.rowPath}`}>{t.path}</span>
                </span>
                {others.length > 0 && (
                  <select
                    className={`${controls.input} ${own.copyTo}`}
                    aria-label={`Copy ${t.title} to another Family`}
                    value=""
                    onChange={(e) => {
                      const to = others.find((o) => o.repo === e.target.value)
                      if (to) copy(t, to)
                    }}
                  >
                    <option value="">Copy to…</option>
                    {others.map((o) => (
                      <option key={o.repo} value={o.repo}>
                        {o.title}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className={controls.ghost}
                  aria-label={`Edit ${t.title}`}
                  aria-pressed={editing === t.path}
                  onClick={() => setEditing(editing === t.path ? null : t.path)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={controls.ghost}
                  aria-label={`Delete ${t.title}`}
                  onClick={() => remove(t)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
        {graph &&
          (naming ? (
            <form
              className={own.newTemplate}
              onSubmit={(e) => {
                e.preventDefault()
                make()
              }}
            >
              <input
                className={controls.input}
                aria-label="Template name"
                placeholder="Meeting notes"
                autoComplete="off"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className={controls.primary}>
                Create template
              </button>
              <button type="button" className={controls.ghost} onClick={() => setNaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className={own.newTemplate}>
              <button type="button" className={controls.primary} onClick={() => setNaming(true)}>
                <Icon name="plus" />
                New template
              </button>
            </div>
          ))}
        {notice && (
          <p className={styles.note} role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className={controls.error} role="alert">
            {error}
          </p>
        )}
      </fieldset>
      {current && (
        <section className={own.editor} aria-label="Template editor">
          <div className={own.editorHead}>
            <span>
              Editing <strong>{current.title}</strong>
            </span>
            <button type="button" className={controls.ghost} onClick={() => setEditing(null)}>
              Done
            </button>
          </div>
          <div className={own.editorBody}>
            <LeafEditor
              key={`${family.repo} ${current.path}`}
              repo={family.repo}
              path={current.path}
              source={false}
              onOpen={(id) => {
                window.location.hash = `#${treeHref(family.repo, id)}`
              }}
            />
          </div>
        </section>
      )}
    </>
  )
}
