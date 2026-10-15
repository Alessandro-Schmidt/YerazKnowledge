// Which part of a leaf's cover shows: line 2's `coverPosition`, a percentage from the top,
// as CSS object-position draws it.

import type { LeafMeta } from '../model/parse'

/** Which part of the cover shows: a percentage from the top (line 2's `coverPosition`). */
export function coverPosition(meta: LeafMeta | null | undefined): number {
  const y = meta?.coverPosition
  return typeof y === 'number' && Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50
}

/**
 * The position after dragging the image `dy` px down: the image follows the pointer.
 * `box` is the slot, `image` the picture's own size; it is drawn to cover the slot.
 */
export function dragCover(
  y: number,
  dy: number,
  box: { width: number; height: number },
  image: { width: number; height: number },
): number {
  const scale = Math.max(box.width / image.width, box.height / image.height)
  const hidden = image.height * scale - box.height
  if (hidden < 1) return y
  return Math.round(Math.min(100, Math.max(0, y - (dy / hidden) * 100)))
}
