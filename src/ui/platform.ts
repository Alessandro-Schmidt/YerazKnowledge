// The device, for naming its keys: ⌘ on Apple keyboards, Ctrl elsewhere; touch has none.

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** A touch screen without a fine pointer: no Ctrl or ⌘ key to hold. */
export const isTouch = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
