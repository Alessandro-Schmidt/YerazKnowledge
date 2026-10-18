// A leaf's history, shown in the Peek in place of its editor: past versions read straight
// from git, each compared with the current text, and "Restore this version", which saves
// the old text as a new edit (committed like any other, so it is never a history rewrite).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Version } from '../github/graphql'
import { lineDiff } from '../model/diff'
import { session } from '../store/session'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import styles from './History.module.css'

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const reason = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

export function History({
  repo,
  path,
  view,
  onClose,
}: {
  repo: string
  path: string
  /** A version's text as the read view draws it. */
  view(text: string, sha: string): ReactNode
  /** Back to the leaf's editor (also after a restore, which it then shows). */
  onClose(): void
}) {
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ version: Version; text: string | null } | null>(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const page = (after: string | null) =>
    session
      .getState()
      .history(repo, path, after)
      .then(
        (p) => {
          setVersions((v) => [...(after ? (v ?? []) : []), ...p.versions])
          setNext(p.next)
        },
        (e: unknown) => setError(reason(e)),
      )
  const more = (after: string) => {
    setBusy(true)
    void page(after).finally(() => setBusy(false))
  }

  useEffect(() => {
    void page(null)
    // The text now, pending edits included: what a version is compared with.
    void session
      .getState()
      .textOf(repo, path)
      .then(setCurrent, () => setCurrent(''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, path])

  // Focus follows the view: the list, or the version just opened.
  useEffect(() => heading.current?.focus(), [picked?.version])

  const open = (version: Version) => {
    setPicked({ version, text: null })
    setReading(false)
    setError(null)
    session
      .getState()
      .versionText(repo, version.blob!)
      .then(
        (text) => setPicked((p) => (p?.version === version ? { version, text } : p)),
        (e: unknown) => setError(reason(e)),
      )
  }

  const restore = (version: Version) => {
    setBusy(true)
    session
      .getState()
      .restore(repo, path, version.blob!)
      .then(onClose, (e: unknown) => {
        setError(reason(e))
        setBusy(false)
      })
  }

  const back = (
    <button type="button" className={controls.ghost} onClick={onClose}>
      Back to the leaf
    </button>
  )
  const failed = error && (
    <p className={controls.error} role="alert">
      {error}
    </p>
  )

  if (picked) {
    const { version, text } = picked
    const same = text !== null && text === current
    return (
      <section className={styles.history} aria-labelledby="history-title">
        <div className={styles.top}>
          <button
            type="button"
            className={controls.iconButton}
            aria-label="All versions"
            onClick={() => setPicked(null)}
          >
            <Icon name="chevronLeft" />
          </button>
          <h2 id="history-title" ref={heading} tabIndex={-1} className={styles.picked}>
            {version.message}
            <span className={`${controls.mono} ${styles.when}`}>
              {when(version.date)} · {version.author}
            </span>
          </h2>
        </div>
        <div className={styles.bar}>
          <div className={styles.switch} role="group" aria-label="Show">
            <button type="button" aria-pressed={!reading} onClick={() => setReading(false)}>
              Changes
            </button>
            <button type="button" aria-pressed={reading} onClick={() => setReading(true)}>
              This version
            </button>
          </div>
          <button
            type="button"
            className={controls.primary}
            disabled={busy || text === null || same}
            onClick={() => restore(version)}
          >
            {busy ? 'Restoring…' : 'Restore this version'}
          </button>
        </div>
        {failed}
        {text === null || current === null ? (
          !error && <div className={styles.loading} aria-busy="true" />
        ) : reading ? (
          view(text, version.blob!)
        ) : same ? (
          <p className={styles.note}>This version is the same as the current text.</p>
        ) : (
          <Changes before={text} after={current} />
        )}
      </section>
    )
  }

  return (
    <section className={styles.history} aria-labelledby="history-title">
      <div className={styles.top}>
        <h2 id="history-title" ref={heading} tabIndex={-1} className={controls.eyebrow}>
          History
        </h2>
        {back}
      </div>
      {failed}
      {versions === null ? (
        !error && <div className={styles.loading} aria-busy="true" />
      ) : (
        <ol className={styles.versions}>
          {versions.map((v) => (
            <li key={v.commit}>
              {v.blob ? (
                <button type="button" className={styles.version} onClick={() => open(v)}>
                  <span className={styles.message}>{v.message}</span>
                  <span className={`${controls.mono} ${styles.when}`}>
                    {when(v.date)} · {v.author}
                  </span>
                </button>
              ) : (
                <span className={styles.version} data-deleted="">
                  <span className={styles.message}>{v.message}</span>
                  <span className={`${controls.mono} ${styles.when}`}>
                    {when(v.date)} · deleted here
                  </span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {next ? (
        <button
          type="button"
          className={`${controls.ghost} ${styles.more}`}
          disabled={busy}
          onClick={() => more(next)}
        >
          {busy ? 'Loading…' : 'Older versions'}
        </button>
      ) : (
        versions && (
          <p className={styles.note}>
            History follows the file's path: versions from before a move aren't listed.
          </p>
        )
      )}
    </section>
  )
}

/** What changed from a version to the current text, line by line. */
function Changes({ before, after }: { before: string; after: string }) {
  return (
    <>
      <p className={`${controls.mono} ${styles.legend}`}>
        <del>− this version</del> <ins>+ now</ins>
      </p>
      <pre className={styles.diff} aria-label="Changes from this version to now">
        {lineDiff(before, after).map((line, i) =>
          line.kind === 'skip' ? (
            <span key={i} className={styles.skip}>
              {line.count} unchanged {line.count === 1 ? 'line' : 'lines'}
            </span>
          ) : line.kind === 'removed' ? (
            <del key={i}>{line.text || ' '}</del>
          ) : line.kind === 'added' ? (
            <ins key={i}>{line.text || ' '}</ins>
          ) : (
            <span key={i}>{line.text || ' '}</span>
          ),
        )}
      </pre>
    </>
  )
}
