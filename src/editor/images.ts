// Images people add (ARCHITECTURE.md §8): committed unchanged up to 4096 px in a format
// GitHub shows; larger ones are scaled to 4096 px on the long edge. Photos become WebP at
// quality 92; screenshots, diagrams and transparency stay lossless. Never upscaled.

export const MAX_EDGE = 4096
/** Files above this get a warning before they are committed (ARCHITECTURE.md §11). */
export const WARN_BYTES = 10 * 1024 * 1024

const KEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']

export type ImagePlan =
  | { keep: true }
  /** `quality` 1 means lossless. */
  | { keep: false; width: number; height: number; quality: number }

export function imagePlan(image: { type: string; width: number; height: number }): ImagePlan {
  // SVG is a vector; a GIF may be animated, and redrawing it would keep one frame.
  if (image.type === 'image/svg+xml' || image.type === 'image/gif') return { keep: true }
  const long = Math.max(image.width, image.height)
  if (long <= MAX_EDGE && KEPT.includes(image.type)) return { keep: true }
  const scale = Math.min(1, MAX_EDGE / long)
  return {
    keep: false,
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
    quality: image.type === 'image/jpeg' ? 0.92 : 1,
  }
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/** The bytes to commit for an image file, and their extension. Browser only. */
export async function prepareImage(file: Blob): Promise<{ bytes: Uint8Array; ext: string }> {
  const original = async () => ({
    bytes: new Uint8Array(await file.arrayBuffer()),
    ext: EXT[file.type] ?? 'bin',
  })
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return original()
  const bitmap = await createImageBitmap(file)
  const plan = imagePlan({ type: file.type, width: bitmap.width, height: bitmap.height })
  if (plan.keep) {
    bitmap.close()
    return original()
  }
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  const context = canvas.getContext('2d')!
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, plan.width, plan.height)
  bitmap.close()
  // Chromium encodes WebP losslessly at quality 1. Without WebP encoding (Safari), PNG
  // stays lossless and photos fall back to JPEG.
  const encode = (type: string, quality: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality),
    )
  let out = await encode('image/webp', plan.quality)
  if (out.type !== 'image/webp')
    out = await encode(plan.quality < 1 ? 'image/jpeg' : 'image/png', plan.quality)
  return { bytes: new Uint8Array(await out.arrayBuffer()), ext: EXT[out.type] ?? 'png' }
}
