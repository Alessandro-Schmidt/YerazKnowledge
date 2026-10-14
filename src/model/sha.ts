// Git object hashing. A blob's SHA is SHA-1 of "blob <byteLength>\0<content>",
// which is what `git hash-object` prints and what GitHub returns for each file.

const encoder = new TextEncoder()

export async function sha1Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  const digest = await crypto.subtle.digest('SHA-1', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function gitBlobSha(content: Uint8Array | string): Promise<string> {
  const body = typeof content === 'string' ? encoder.encode(content) : content
  const header = encoder.encode(`blob ${body.byteLength}\0`)
  const object = new Uint8Array(header.byteLength + body.byteLength)
  object.set(header)
  object.set(body, header.byteLength)
  return sha1Hex(object)
}
