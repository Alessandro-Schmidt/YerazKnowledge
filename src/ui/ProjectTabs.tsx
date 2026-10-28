// Projects: one tab per Family under the top bar, the one on screen marked, All first when
// there are several. + makes a new project (the introduction: GitHub or a folder); × on a
// tab removes that Family from this device, as the Family menu's Remove does.

import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { useSession } from '../store/session'
import { RemoveFamilyDialog } from './FamilyMenu'
import { Icon } from './icons'
import { allHref, treeHref } from './paths'
import styles from './ProjectTabs.module.css'

/** `current`: the Family on screen; `all`: every Family on one map is. */
export function ProjectTabs({ current, all }: { current?: string; all?: boolean }) {
  const trees = useSession((s) => s.trees)
  const [removing, setRemoving] = useState<TreeRef | null>(null)
  const [, navigate] = useLocation()
  return (
    <nav className={styles.tabs} aria-label="Projects">
      {trees.length > 1 && (
        <span className={styles.tab}>
          <Link href={allHref()} aria-current={all ? 'page' : undefined}>
            All
          </Link>
        </span>
      )}
      {trees.map((t) => (
        <span key={t.repo} className={styles.tab}>
          <Link
            href={treeHref(t.repo)}
            aria-current={t.repo.toLowerCase() === current?.toLowerCase() ? 'page' : undefined}
          >
            {t.title}
          </Link>
          <button
            type="button"
            className={styles.close}
            aria-label={`Remove ${t.title}`}
            onClick={() => setRemoving(t)}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <Link href="/welcome" className={styles.add} aria-label="New project" title="New project">
        <Icon name="plus" size={14} />
      </Link>
      {removing && (
        <RemoveFamilyDialog
          tree={removing}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            setRemoving(null)
            // The one on screen, or All with one Family left: `#/` picks what is left.
            if (all || removing.repo.toLowerCase() === current?.toLowerCase()) navigate('/')
          }}
        />
      )}
    </nav>
  )
}
