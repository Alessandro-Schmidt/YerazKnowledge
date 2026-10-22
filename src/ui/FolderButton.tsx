// "Use a folder" (issue #64): a folder on this device as a Family, so no GitHub account is
// needed. One that iCloud Drive, Dropbox, OneDrive or a shared drive keeps in sync shares
// the notes with the person's other devices. A browser that can't open folders (phones,
// Safari, Firefox) keeps the Family in its own storage: started empty, or from a copy of a
// folder's files.

import { useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { NewFamilyDialog } from './FamilyMenu'
import { Icon } from './icons'

export function FolderButton({ onAdded }: { onAdded(tree: TreeRef): void }) {
  const can = useSession((s) => s.folders)
  const onDevice = useSession((s) => s.onDevice)
  const [error, setError] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  if (!can)
    return (
      <p className={controls.hint}>
        This browser can't open folders. Use Chrome or Edge on a computer, or the desktop app.
      </p>
    )
  const add = async (empty: boolean, name?: string) => {
    setError(null)
    try {
      await start(empty, name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const start = async (empty: boolean, name?: string) => {
    const tree = await session.getState().addFolder(empty, name)
    if (tree) onAdded(tree)
  }
  return (
    <>
      <button type="button" className={controls.ghost} onClick={() => void add(false)}>
        <Icon name="folder" />
        {onDevice ? 'Copy in a folder' : 'Use a folder'}
      </button>
      {onDevice && (
        <button type="button" className={controls.ghost} onClick={() => setNaming(true)}>
          <Icon name="plus" />
          Start on this device
        </button>
      )}
      {naming && (
        <NewFamilyDialog onClose={() => setNaming(false)} onName={(name) => start(true, name)} />
      )}
      {error && (
        <p className={controls.error} role="alert">
          {error}
        </p>
      )}
    </>
  )
}
