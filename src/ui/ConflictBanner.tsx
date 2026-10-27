import { Link } from 'wouter'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import styles from './ConflictBanner.module.css'
import { Icon } from './icons'
import { treeHref } from './paths'

/** When both devices changed the same lines: where your version went (ARCHITECTURE.md §5.2). */
export function ConflictBanner({ repo }: { repo: string }) {
  const state = useSession((s) => s.sync[repo.toLowerCase()])
  if (state?.status !== 'conflict') return null
  return (
    <div className={styles.banner} role="alert">
      <p>
        Another device changed the same lines. GitHub’s version stays in place, and yours is saved
        as{' '}
        {state.copies.map((copy, i) => (
          <span key={copy}>
            {i > 0 && ', '}
            <Link href={treeHref(repo, copy)} className={controls.mono}>
              {copy}
            </Link>
          </span>
        ))}
        .
      </p>
      <button
        type="button"
        className={controls.iconButton}
        aria-label="Dismiss"
        onClick={() => session.getState().dismissConflict(repo)}
      >
        <Icon name="close" />
      </button>
    </div>
  )
}
