import { describe, expect, it } from 'vitest'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomIv,
  generateRandomSalt,
} from '../utils'

describe('crypto utils', () => {
  it('round trips ArrayBuffer through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    const encoded = arrayBufferToBase64(bytes.buffer)
    const decoded = new Uint8Array(base64ToArrayBuffer(encoded))
    expect(decoded).toEqual(bytes)
  })

  it('throws on invalid base64', () => {
    expect(() => base64ToArrayBuffer('***not-base64***')).toThrow('Invalid base64 input')
  })

  it('creates 12-byte random IV by default', () => {
    const iv = generateRandomIv()
    expect(iv).toBeInstanceOf(Uint8Array)
    expect(iv.length).toBe(12)
  })

  it('creates random IV values', () => {
    const iv1 = generateRandomIv()
    const iv2 = generateRandomIv()
    expect(Array.from(iv1)).not.toEqual(Array.from(iv2))
  })

  it('creates 16-byte random salt by default', () => {
    const salt = generateRandomSalt()
    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt.length).toBe(16)
  })

  it('supports custom random lengths', () => {
    expect(generateRandomIv(24).length).toBe(24)
    expect(generateRandomSalt(32).length).toBe(32)
  })
})
