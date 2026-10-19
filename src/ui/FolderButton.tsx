// "Use a folder" (issue #64): a folder on this device as a Family, so no GitHub account is
// needed. One that iCloud Drive, Dropbox, OneDrive or a shared drive keeps in sync shares
// the notes with the person's other devices.

import { useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { Icon } from './icons'

export function FolderButton({ onAdded }: { onAdded(tree: TreeRef): void }) {
  const can = useSession((s) => s.folders)
  const [error, setError] = useState<string | null>(null)
  if (!can)
    return (
      <p className={controls.hint}>
        This browser can't open folders. Use Chrome or Edge on a computer, or the desktop app.
      </p>
    )
  return (
    <>
      <button
        type="button"
        className={controls.ghost}
        onClick={async () => {
          setError(null)
          try {
            const tree = await session.getState().addFolder()
            if (tree) onAdded(tree)
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        }}
      >
        <Icon name="folder" />
        Use a folder
      </button>
      {error && (
        <p className={controls.error} role="alert">
          {error}
        </p>
      )}
    </>
  )
}
