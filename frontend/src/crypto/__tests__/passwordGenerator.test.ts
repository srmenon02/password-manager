import { describe, expect, it } from 'vitest'
import { generateSecurePassword } from '../passwordGenerator'

describe('passwordGenerator', () => {
  it('generates a 24-char password by default', () => {
    const password = generateSecurePassword()
    expect(password.length).toBe(24)
  })

  it('generates custom length passwords', () => {
    const password = generateSecurePassword({ length: 32 })
    expect(password.length).toBe(32)
  })

  it('includes all selected character classes', () => {
    const password = generateSecurePassword({ length: 32 })
    expect(/[a-z]/.test(password)).toBe(true)
    expect(/[A-Z]/.test(password)).toBe(true)
    expect(/[0-9]/.test(password)).toBe(true)
    expect(/[!@#$%^&*()\-_=+\[\]{};:,.?]/.test(password)).toBe(true)
  })

  it('supports restricted character sets', () => {
    const password = generateSecurePassword({
      length: 16,
      includeLower: false,
      includeUpper: false,
      includeDigits: true,
      includeSymbols: false,
    })

    expect(/^[0-9]+$/.test(password)).toBe(true)
  })

  it('throws for too-short length', () => {
    expect(() => generateSecurePassword({ length: 8 })).toThrow('Password length must be at least 12')
  })

  it('throws when no character sets are enabled', () => {
    expect(() =>
      generateSecurePassword({
        includeLower: false,
        includeUpper: false,
        includeDigits: false,
        includeSymbols: false,
      })
    ).toThrow('At least one character set must be enabled')
  })
})
