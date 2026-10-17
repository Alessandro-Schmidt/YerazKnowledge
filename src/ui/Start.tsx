// `#/`: the app opens straight into a Family, the one last shown on this device or the
// first one found. Without any, it says what a Family is and how to make or connect one.

import { useEffect, useState } from 'react'
import { Redirect, useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { ConnectDialog, FamilyMenu, lastFamily } from './FamilyMenu'
import styles from './FamilyView.module.css'
import { Icon } from './icons'
import { treeHref } from './paths'
import { CreateTreeDialog } from './StructureDialogs'
import { Divider, TopBar } from './TopBar'

export function Start() {
  const trees = useSession((s) => s.trees)
  const discovery = useSession((s) => s.discovery)
  const [dialog, setDialog] = useState<'connect' | 'create' | null>(null)
  const [, navigate] = useLocation()

  useEffect(() => {
    if (session.getState().trees.length === 0) void session.getState().discover()
  }, [])

  const last = lastFamily()?.toLowerCase()
  const family = trees.find((t) => t.repo.toLowerCase() === last) ?? trees[0]
  if (family) return <Redirect to={treeHref(family.repo)} replace />

  const go = (tree: TreeRef) => {
    void session.getState().open(tree.repo)
    navigate(treeHref(tree.repo))
  }
  const looking = discovery === 'idle' || discovery === 'loading'
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
        {looking ? (
          <p className={styles.placeholder} aria-busy="true">
            Looking for your notes…
          </p>
        ) : (
          <div className={styles.placeholder}>
            <h2 className={styles.emptyTitle}>No Family yet</h2>
            <p>
              A Family is a GitHub repository with a <code>.yeraz.json</code> file at its root.
              Every folder or leaf at its top is a Tree.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={controls.primary}
                onClick={() => setDialog('create')}
              >
                <Icon name="plus" />
                Create a new repository
              </button>
              <button type="button" className={controls.ghost} onClick={() => setDialog('connect')}>
                <Icon name="repo" />
                Connect repository
              </button>
            </div>
          </div>
        )}
      </main>
      {dialog === 'connect' && <ConnectDialog onClose={() => setDialog(null)} onConnected={go} />}
      {dialog === 'create' && <CreateTreeDialog onClose={() => setDialog(null)} onCreated={go} />}
    </div>
  )
}
