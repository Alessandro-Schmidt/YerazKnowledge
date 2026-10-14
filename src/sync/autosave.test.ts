import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosave, IDLE_MS } from './autosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('commits two minutes after the last edit, not a moment before', async () => {
    const commit = vi.fn(async () => {})
    const save = createAutosave(commit)
    save.touch()
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    expect(commit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('restarts the wait on every edit', async () => {
    const commit = vi.fn(async () => {})
    const save = createAutosave(commit)
    save.touch()
    await vi.advanceTimersByTimeAsync(90_000)
    save.touch()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(commit).not.toHaveBeenCalled()
    expect(save.due()).toBe(Date.now() + 30_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(save.due()).toBeNull()
  })

  it('flushes immediately and cancels the timer', async () => {
    const commit = vi.fn(async () => {})
    const save = createAutosave(commit)
    save.touch()
    await save.flush()
    expect(commit).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('never runs two commits at once; a flush during a commit runs once after it', async () => {
    let release!: () => void
    const commit = vi.fn(() => new Promise<void>((r) => (release = r)))
    const save = createAutosave(commit)
    const first = save.flush()
    void save.flush()
    void save.flush()
    expect(commit).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
    release()
    await first
  })

  it('stops after dispose', async () => {
    const commit = vi.fn(async () => {})
    const save = createAutosave(commit)
    save.touch()
    save.dispose()
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(commit).not.toHaveBeenCalled()
  })
})
