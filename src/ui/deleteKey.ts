// The Delete key (or Backspace, the delete key of a Mac keyboard) on the selection opens
// the same confirm dialog as the Peek menu's Delete…, unless typed into a field or the editor.

import { useEffect, useRef } from 'react'

/** `id`: the node the key would delete, or null while nothing deletable is selected. */
export function useDeleteKey(id: string | null, onDelete: (id: string) => void) {
  const latest = useRef(onDelete)
  useEffect(() => {
    latest.current = onDelete
  })
  useEffect(() => {
    if (id === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || e.metaKey || e.ctrlKey || e.altKey)
        return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, dialog, [role="dialog"], [role="menu"]'))
      )
        return
      e.preventDefault()
      latest.current(id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [id])
}
