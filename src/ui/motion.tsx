// Motion (issue #66): things come in, go out, grow and settle instead of appearing. Entrances
// are CSS (`enter` keyframes in each panel's styles); what CSS can't start (an exit, a
// change of size, a leaf replacing another, the map's nodes moving to a new layout) is the
// Web Animations API, here. Off when the system asks for reduced motion, or where the
// browser has no `animate` (tests).

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
/** The time most motion takes, ms: long enough to follow, short enough not to wait for. */
export const DURATION = 240

const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true

/** Plays `keyframes` on `el`; null when there is no motion to play. */
export function play(
  el: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions = {},
): Animation | null {
  if (!el || typeof el.animate !== 'function' || still()) return null
  return el.animate(keyframes, { duration: DURATION, easing: EASE, ...options })
}

/** How a panel leaves: back the way it came in (its `--enter` offset), fading. */
export function leave(el: Element | null | undefined): Animation | null {
  if (!el) return null
  const from = getComputedStyle(el).getPropertyValue('--enter').trim() || '0, 8px'
  return play(el, [{}, { opacity: 0, transform: `translate(${from})` }], {
    duration: 200,
    easing: 'ease-in',
    fill: 'forwards',
  })
}

/**
 * Its child while `show`, and for as long as the child's exit (`leave`) plays after: what
 * it last showed stays, still, so its props can already be gone.
 */
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const [kept, setKept] = useState(children)
  const box = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(!show)
  if (show && kept !== children) setKept(children)
  if (show && gone) setGone(false)
  useLayoutEffect(() => {
    if (show || gone) return
    const el = box.current?.firstElementChild as HTMLElement | null | undefined
    const exit = leave(el)
    if (!el || !exit) return setGone(true)
    // Not clickable while it goes; shown again (`show` back before the end), as it was.
    el.style.pointerEvents = 'none'
    exit.onfinish = () => setGone(true)
    return () => {
      exit.cancel()
      el.style.pointerEvents = ''
    }
  }, [show, gone])
  if (gone && !show) return null
  return (
    <div ref={box} style={{ display: 'contents' }}>
      {show ? children : kept}
    </div>
  )
}
