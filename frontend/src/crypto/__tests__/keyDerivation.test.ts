import { describe, it, expect } from 'vitest'
import { deriveKey, generateSalt } from '../keyDerivation'

describe('keyDerivation', () => {
  describe('generateSalt', () => {
    it('should generate a 16-byte salt', () => {
      const salt = generateSalt()
      expect(salt).toBeInstanceOf(Uint8Array)
      expect(salt.length).toBe(16)
    })

    it('should generate unique salts on each call', () => {
      const salt1 = generateSalt()
      const salt2 = generateSalt()
      
      // Salts should not be identical
      const areEqual = salt1.every((byte, index) => byte === salt2[index])
      expect(areEqual).toBe(false)
    })

    it('should generate cryptographically random salts', () => {
      const salts = Array.from({ length: 10 }, () => generateSalt())
      
      // Check that at least some bytes differ across all salts
      const allSame = salts.every(salt => 
        salt.every((byte, i) => byte === salts[0][i])
      )
      expect(allSame).toBe(false)
    })
  })

  describe('deriveKey', () => {
    it('should derive a CryptoKey from password and salt', async () => {
      const password = 'testPassword123!'
      const salt = generateSalt()
      
      const key = await deriveKey(password, salt)
      
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.type).toBe('secret')
      expect(key.algorithm.name).toBe('AES-GCM')
      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
    })

    it('should produce consistent keys with same password and salt', async () => {
        const password = 'mySecurePassword'
        const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
        const key1 = await deriveKey(password, salt)
        const key2 = await deriveKey(password, salt)

        const iv = crypto.getRandomValues(new Uint8Array(12))
        const plaintext = new TextEncoder().encode('consistency-check')

        const ciphertext1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, plaintext)
        const ciphertext2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key2, plaintext)

        expect(new Uint8Array(ciphertext1)).toEqual(new Uint8Array(ciphertext2))
    })

    it('should produce different keys with different passwords', async () => {
        const salt = generateSalt()
        const password1 = 'password1'
        const password2 = 'password2'
        const key1 = await deriveKey(password1, salt)
        const key2 = await deriveKey(password2, salt)

        const iv = crypto.getRandomValues(new Uint8Array(12))
        const plaintext = new TextEncoder().encode('consistency-check')

        const ciphertext1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, plaintext)
        const ciphertext2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key2, plaintext)

        expect(new Uint8Array(ciphertext1)).not.toEqual(new Uint8Array(ciphertext2))
        })

    it('should produce different keys with different salts', async () => {
        const password = 'samePassword'
        const salt1 = generateSalt()
        const salt2 = generateSalt()
        const key1 = await deriveKey(password, salt1)
        const key2 = await deriveKey(password, salt2)

        const iv = crypto.getRandomValues(new Uint8Array(12))
        const plaintext = new TextEncoder().encode('consistency-check')

        const ciphertext1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, plaintext)
        const ciphertext2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key2, plaintext)

        expect(new Uint8Array(ciphertext1)).not.toEqual(new Uint8Array(ciphertext2))
    })

    it('should handle empty password', async () => {
      const password = ''
      const salt = generateSalt()
      
      const key = await deriveKey(password, salt)
      
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.algorithm.name).toBe('AES-GCM')
    })

    it('should handle passwords with special characters', async () => {
      const password = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./'
      const salt = generateSalt()
      
      const key = await deriveKey(password, salt)
      
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.algorithm.name).toBe('AES-GCM')
    })

    it('should handle passwords with unicode characters', async () => {
      const password = '密码🔐émojis中文'
      const salt = generateSalt()
      
      const key = await deriveKey(password, salt)
      
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.algorithm.name).toBe('AES-GCM')
    })

    it('should handle very long passwords', async () => {
      const password = 'a'.repeat(1000)
      const salt = generateSalt()
      
      const key = await deriveKey(password, salt)
      
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.algorithm.name).toBe('AES-GCM')
    })

    it('should derive key that can be used for encryption', async () => {
      const password = 'testPassword'
      const salt = generateSalt()
      const key = await deriveKey(password, salt)
      
      // Verify key has correct usage
      expect(key.usages).toContain('encrypt')
      expect(key.usages).toContain('decrypt')
    })

    it('should use 100,000 iterations (verify by timing)', async () => {
      // This test verifies PBKDF2 takes reasonable time (100k iterations)
      const password = 'testPassword'
      const salt = generateSalt()
      
      const startTime = performance.now()
      await deriveKey(password, salt)
      const endTime = performance.now()
      
      const duration = endTime - startTime
      
      // 100k iterations should take at least a few milliseconds
      // but not more than a few seconds on modern hardware
      expect(duration).toBeGreaterThan(5) // At least 5ms
      expect(duration).toBeLessThan(5000) // Less than 5 seconds
    })
  })
})
