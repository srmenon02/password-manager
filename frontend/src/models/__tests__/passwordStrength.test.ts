import { describe, expect, it } from 'vitest'
import { countReusedPasswords, passwordStrength, reusedPasswordSet } from '../passwordStrength'

describe('passwordStrength', () => {
  it('scores an empty password as very weak', () => {
    expect(passwordStrength('')).toMatchObject({ score: 0, label: 'very weak' })
  })

  it('discounts repeated and sequential runs', () => {
    expect(passwordStrength('aaaaaaaaaa').score).toBe(0)
    expect(passwordStrength('abcdefghij').score).toBe(0)
    // Same length and charset, but no runs to discount.
    expect(passwordStrength('qmzkrvtwjb').score).toBeGreaterThan(0)
  })

  it('never lets a long run buy strength through length alone', () => {
    // A flat per-character discount still accumulates without bound, which rated all three of
    // these "strong" or "excellent". None of them is a substring of COMMON, so the pattern
    // clamp cannot catch them either — the run discount itself has to decay.
    expect(passwordStrength('a'.repeat(40)).score).toBe(0)
    expect(passwordStrength('abcdefghijklmnopqrstuvwxyz').score).toBe(0)
    expect(passwordStrength('ab'.repeat(30)).score).toBe(0)
  })

  it('keeps a long run weaker than a genuinely random password of the same length', () => {
    expect(passwordStrength('a'.repeat(20)).bits).toBeLessThan(
      passwordStrength('9Yw!kQ2#vNs4^bTr7&mL').bits
    )
  })

  it('rewards length and charset variety', () => {
    const short = passwordStrength('Xk7$q')
    const long = passwordStrength('Xk7$qP2!wRm9@tLz')
    expect(long.bits).toBeGreaterThan(short.bits)
    expect(long.score).toBeGreaterThan(short.score)
    expect(passwordStrength('9Yw!kQ2#vNs4^bTr7&mL').score).toBe(4)
  })

  it('caps a password containing a common pattern at weak and says why', () => {
    expect(passwordStrength('Password!2024xyz')).toMatchObject({
      score: 1,
      reason: 'common-pattern',
    })
    expect(passwordStrength('correct-qwerty-battery-staple').score).toBe(1)
    expect(passwordStrength('9Yw!kQ2#vNs4^bTr7&mL').reason).toBeNull()
  })
})

describe('password reuse', () => {
  it('counts every entry sharing a password', () => {
    expect(countReusedPasswords(['a', 'b', 'a', 'c'])).toBe(2)
    expect(countReusedPasswords(['a', 'a', 'a'])).toBe(3)
    expect(countReusedPasswords(['a', 'b', 'c'])).toBe(0)
  })

  it('reports which passwords are shared', () => {
    expect([...reusedPasswordSet(['a', 'b', 'a'])]).toEqual(['a'])
    expect([...reusedPasswordSet(['a', 'b'])]).toEqual([])
  })
})
