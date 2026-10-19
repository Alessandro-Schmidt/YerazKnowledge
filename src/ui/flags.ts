// Flags where the system's emoji have none (Windows: "🇫🇷" shows as the letters FR). There,
// a flags-only cut of Google's Noto Color Emoji (SIL OFL 1.1, public/fonts/) draws them, the
// closest free match to Apple's; Apple's own may not be bundled. Its unicode-range means it
// is fetched only when a flag is on screen. Apple's and Android's own flags stay.
// The font was cut with: pyftsubset noto-color-emoji-emoji-400-normal.woff2 (Fontsource
// 5.3.2) --unicodes="U+1F1E6-1F1FF,U+1F3F4,U+E0020-E007F" --layout-features='*'
// --drop-tables+=SVG --flavor=woff2

export const FLAGS_FONT = 'Yeraz Flags'

/** Whether the system draws 🇫🇷 in colour: two regional letters in black are its fallback. */
function systemHasFlags(): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 24
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true
  ctx.font = '20px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText('\u{1F1EB}\u{1F1F7}', 0, 0)
  const pixels = ctx.getImageData(0, 0, 24, 24).data
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i + 3]! > 0 && (pixels[i] !== pixels[i + 1] || pixels[i + 1] !== pixels[i + 2]))
      return true
  return false
}

/** Adds the flags font when the system lacks flags; the font stacks name it first. */
export function installFlags() {
  // No version of Windows has flag emoji; elsewhere, look.
  if (!/Windows/.test(navigator.userAgent) && systemHasFlags()) return
  const style = document.createElement('style')
  style.textContent = `@font-face{font-family:'${FLAGS_FONT}';src:url('${import.meta.env.BASE_URL}fonts/noto-flags.woff2') format('woff2');unicode-range:U+1F1E6-1F1FF,U+1F3F4,U+E0020-E007F;font-display:swap}`
  document.head.append(style)
}
