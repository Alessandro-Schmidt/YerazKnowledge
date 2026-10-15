import { describe, expect, it } from 'vitest'
import { memoryStore } from './db'
import { tokenStore } from './token'

describe('tokenStore', () => {
  it('keeps the token in the key/value store on the web, under the same key as before', async () => {
    const store = memoryStore()
    const tokens = tokenStore(store)
    expect(await tokens.get()).toBeUndefined()
    await tokens.set('ghp_web')
    expect(store.data.get('session:token')).toBe('ghp_web')
    expect(await tokens.get()).toBe('ghp_web')
    await tokens.set(undefined)
    expect(await tokens.get()).toBeUndefined()
  })

  it('keeps it in the OS keychain on desktop, never in the key/value store', async () => {
    const store = memoryStore()
    const keychain = new Map<string, string>()
    const calls: string[] = []
    const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push(cmd)
      if (cmd === 'set_token') keychain.set('token', args!.token as string)
      if (cmd === 'delete_token') keychain.delete('token')
      return (cmd === 'get_token' ? (keychain.get('token') ?? null) : null) as T
    }
    const tokens = tokenStore(store, invoke)
    expect(await tokens.get()).toBeUndefined()
    await tokens.set('ghp_desktop')
    expect(await tokens.get()).toBe('ghp_desktop')
    expect(store.data.size).toBe(0)
    await tokens.set(undefined)
    expect(await tokens.get()).toBeUndefined()
    expect(calls).toEqual(['get_token', 'set_token', 'get_token', 'delete_token', 'get_token'])
  })
})
