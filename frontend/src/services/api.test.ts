import { describe, expect, it, vi } from 'vitest'
import { checkPasswordBreach } from './api'

describe('checkPasswordBreach', () => {
  it('rejects when the signal is already aborted before making the request', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(checkPasswordBreach('password', controller.signal)).rejects.toThrow('aborted')
  })

  it('allows a normal breach lookup to resolve true when the password is known to be pwned', async () => {
    const originalFetch = globalThis.fetch
    const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode('password'))
    const digest = Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
    const suffix = digest.slice(5)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(`${suffix}:2\n`, { status: 200 })))

    try {
      await expect(checkPasswordBreach('password')).resolves.toBe(true)
    } finally {
      vi.unstubAllGlobals()
      globalThis.fetch = originalFetch
    }
  })
})
