import { describe, expect, it, vi } from 'vitest'
import { attach, attachmentMarkdown, extensionOf, MAX_BYTES, WARN_BYTES } from './attach'

/** A host that records what attaching did: files saved, questions asked, messages shown. */
function host(answer = true, existing: string[] = []) {
  const saved = new Map<string, Uint8Array>()
  return {
    saved,
    asked: [] as string[],
    told: [] as string[],
    taken: (path: string) => existing.includes(path) || saved.has(path),
    save: vi.fn(async (path: string, bytes: Uint8Array) => void saved.set(path, bytes)),
    ask(message: string) {
      this.asked.push(message)
      return answer
    },
    tell(message: string) {
      this.told.push(message)
    },
  }
}

/** A file whose size is `size` without allocating it: only `size` is read before refusing. */
const sized = (name: string, size: number, type = 'application/octet-stream') => {
  const file = new File([], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('extensionOf', () => {
  it('keeps the extension, in lower case, or none', () => {
    expect(extensionOf('Q3 Report.XLSX')).toBe('xlsx')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('Makefile')).toBe('')
    expect(extensionOf('.env')).toBe('')
    expect(extensionOf('weird.<ext>')).toBe('')
  })
})

describe('attach', () => {
  it('saves any file byte for byte in assets/, named by date and slug, keeping its extension', async () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 31) % 256)
    const h = host()
    const added = await attach(new File([bytes], 'Q3 Report.xlsx'), h)
    expect(added).toEqual({
      path: expect.stringMatching(/^assets\/\d{4}-\d{2}-\d{2}-q3-report\.xlsx$/),
      image: false,
    })
    expect(h.saved.get(added!.path)).toEqual(bytes)
    expect(h.asked).toEqual([])
  })

  it('never overwrites a file already in the Tree', async () => {
    const first = host()
    const { path } = (await attach(new File(['a'], 'notes.txt'), first))!
    const h = host(true, [path])
    expect((await attach(new File(['b'], 'notes.txt'), h))!.path).toBe(
      path.replace('.txt', '-2.txt'),
    )
  })

  it('keeps a file without an extension without one', async () => {
    const h = host()
    expect((await attach(new File(['all:'], 'Makefile'), h))!.path).toMatch(/-makefile$/)
  })

  it('asks before adding a file over 10 MB, and adds nothing when declined', async () => {
    const big = new File([new Uint8Array(WARN_BYTES + 1)], 'dump.sql')
    const declined = host(false)
    expect(await attach(big, declined)).toBeNull()
    expect(declined.asked).toEqual([
      'dump.sql is 10.0\u00a0MB. Large files make the repository slow to download. Add it anyway?',
    ])
    expect(declined.save).not.toHaveBeenCalled()
    expect(await attach(big, host(true))).not.toBeNull()
  })

  it('refuses a file over GitHub’s 100 MB limit before reading it', async () => {
    const h = host()
    const file = sized('film.mov', MAX_BYTES + 1, 'video/quicktime')
    const read = vi.spyOn(file, 'arrayBuffer')
    expect(await attach(file, h)).toBeNull()
    expect(h.told).toEqual([
      'film.mov is 100.0\u00a0MB. GitHub doesn’t accept files over 100\u00a0MB, so it can’t be added to the Tree.',
    ])
    expect(read).not.toHaveBeenCalled()
    expect(h.save).not.toHaveBeenCalled()
  })
})

describe('attachmentMarkdown', () => {
  it('shows an image where it is', () => {
    expect(attachmentMarkdown('Realm [v2].png', 'assets/2026-10-17-realm-v2.png', true)).toBe(
      '![Realm v2](/assets/2026-10-17-realm-v2.png)',
    )
  })

  it('writes any other file as a paragraph of one link, its name as the text', () => {
    expect(attachmentMarkdown('Q3 [draft].xlsx', 'assets/2026-10-17-q3-draft.xlsx', false)).toBe(
      '\n[Q3 \\[draft\\].xlsx](/assets/2026-10-17-q3-draft.xlsx)\n',
    )
  })
})
