// `#/`: the app opens straight into a Family, the one last shown on this device or the
// first one found. Without any, the introduction offers GitHub or a folder.

import { useEffect } from 'react'
import { Redirect } from 'wouter'
import { session, useSession } from '../store/session'
import { FamilyMenu, lastFamily, openOn } from './FamilyMenu'
import styles from './FamilyView.module.css'
import { allHref, treeHref } from './paths'
import { Divider, TopBar } from './TopBar'

export function Start() {
  const trees = useSession((s) => s.trees)
  const discovery = useSession((s) => s.discovery)

  useEffect(() => {
    if (session.getState().trees.length === 0) void session.getState().discover()
  }, [])

  const last = lastFamily()?.toLowerCase()
  const family = trees.find((t) => t.repo.toLowerCase() === last) ?? trees[0]
  // Every Family together, unless this device chose to open on the last one (issue #69).
  if (trees.length > 1 && openOn() === 'all') return <Redirect to={allHref()} replace />
  if (family) return <Redirect to={treeHref(family.repo)} replace />
  if (discovery !== 'idle' && discovery !== 'loading') return <Redirect to="/welcome" replace />

  return (
    <div className={styles.page}>
      <TopBar>
        <Divider />
        <div className={styles.crumbs}>
          <h1 className={styles.title}>Yeraz</h1>
          <FamilyMenu />
        </div>
      </TopBar>
      <main className={styles.main}>
        <p className={styles.placeholder} aria-busy="true">
          Looking for your notes…
        </p>
      </main>
    </div>
  )
}
