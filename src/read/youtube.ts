// A YouTube video waits for a click (ARCHITECTURE.md §8, SECURITY.md): until it is played,
// nothing is asked of YouTube, so opening a leaf tells Google nothing, not even the reader's
// IP address (which the GDPR counts as personal data). Shared by the read view and the
// editor's live preview; the button holds only the video's id, and the player is built from it.

import { youtubeSrc } from '../model/embeds'
import { escape } from './files'

const ID = /^[\w-]{11}$/

/** The player's stand-in: a button with the video's title, saying what playing it sends. */
export function youtubeButtonHtml(video: { id: string; start: number; title: string }): string {
  const title = video.title || 'YouTube video'
  return (
    `<button type="button" class="youtube-play" data-youtube="${escape(video.id)}" ` +
    `data-start="${video.start}" data-title="${escape(title)}" ` +
    `aria-label="${escape(`Play ${title} from YouTube`)}"><strong>${escape(title)}</strong>` +
    `<span>Plays from YouTube, which then sees your IP address</span></button>`
  )
}

/** A click on a stand-in (or inside one) puts the player in its place, playing. */
export function playYouTube(event: { target: EventTarget | null }): void {
  const button = (event.target as Element | null)?.closest?.<HTMLElement>('[data-youtube]')
  const id = button?.dataset.youtube
  if (!button || !id || !ID.test(id)) return
  const src = youtubeSrc(id, Number(button.dataset.start) || 0)
  const frame = document.createElement('iframe')
  frame.src = `${src}${src.includes('?') ? '&' : '?'}autoplay=1`
  frame.title = button.dataset.title || 'YouTube video'
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
  frame.allowFullscreen = true
  frame.referrerPolicy = 'strict-origin-when-cross-origin'
  button.replaceWith(frame)
}
