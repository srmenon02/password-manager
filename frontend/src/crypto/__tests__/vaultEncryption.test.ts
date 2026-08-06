import { describe, it, expect, beforeAll } from 'vitest'
import { encryptVault, decryptVault } from '../vaultEncryption'
import { deriveKey, generateSalt } from '../keyDerivation'
import type { VaultData } from '@shared/types'

describe('vaultEncryption', () => {
  let testKey: CryptoKey

  beforeAll(async () => {
    // Create a test key for encryption/decryption tests
    const password = 'testPassword123'
    const salt = generateSalt()
    testKey = await deriveKey(password, salt)
  })

  describe('encryptVault and decryptVault', () => {
    it('should encrypt and decrypt vault data correctly', async () => {
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'example.com',
            username: 'user@example.com',
            password: 'securePassword123',
            notes: 'My test account',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01')
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)
      const decrypted = await decryptVault(encrypted, testKey)

      expect(decrypted).toEqual(vaultData)
    })

    it('should produce different ciphertext for same data (due to random IV)', async () => {
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'example.com',
            username: 'test',
            password: 'pass',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        version: 1
      }

      const encrypted1 = await encryptVault(vaultData, testKey)
      const encrypted2 = await encryptVault(vaultData, testKey)

      // Ciphertexts should be different (random IVs)
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)

      // But both should decrypt to same data
      const decrypted1 = await decryptVault(encrypted1, testKey)
      const decrypted2 = await decryptVault(encrypted2, testKey)
      expect(decrypted1).toEqual(vaultData)
      expect(decrypted2).toEqual(vaultData)
    })

    it('should handle empty vault', async () => {
      const emptyVault: VaultData = {
        entries: [],
        version: 1
      }

      const encrypted = await encryptVault(emptyVault, testKey)
      const decrypted = await decryptVault(encrypted, testKey)

      expect(decrypted).toEqual(emptyVault)
      expect(decrypted.entries).toHaveLength(0)
    })

    it('should handle vault with multiple entries', async () => {
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'site1.com',
            username: 'user1',
            password: 'pass1',
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: '2',
            site: 'site2.com',
            username: 'user2',
            password: 'pass2',
            notes: 'Note 2',
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: '3',
            site: 'site3.com',
            username: 'user3',
            password: 'pass3',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)
      const decrypted = await decryptVault(encrypted, testKey)

      expect(decrypted).toEqual(vaultData)
      expect(decrypted.entries).toHaveLength(3)
    })

    it('should handle large vault (100 entries)', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        id: `${i + 1}`,
        site: `site${i + 1}.com`,
        username: `user${i + 1}@example.com`,
        password: `securePassword${i + 1}!@#`,
        notes: `Note for entry ${i + 1}`,
        createdAt: new Date(),
        updatedAt: new Date()
      }))

      const largeVault: VaultData = {
        entries,
        version: 1
      }

      const encrypted = await encryptVault(largeVault, testKey)
      const decrypted = await decryptVault(encrypted, testKey)

      expect(decrypted).toEqual(largeVault)
      expect(decrypted.entries).toHaveLength(100)
    })

    it('should handle special characters in vault data', async () => {
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'example.com',
            username: 'user@test.com',
            password: '!@#$%^&*()_+-={}[]|\\:";\'<>?,./',
            notes: 'Special chars: émojis🔐中文密码',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)
      const decrypted = await decryptVault(encrypted, testKey)

      expect(decrypted).toEqual(vaultData)
      expect(decrypted.entries[0].password).toBe('!@#$%^&*()_+-={}[]|\\:";\'<>?,./')
      expect(decrypted.entries[0].notes).toBe('Special chars: émojis🔐中文密码')
    })

    it('should fail to decrypt with wrong key', async () => {
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'example.com',
            username: 'user',
            password: 'pass',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)

      // Create a different key
      const wrongPassword = 'wrongPassword'
      const salt = generateSalt()
      const wrongKey = await deriveKey(wrongPassword, salt)

      // Decryption should fail
      await expect(decryptVault(encrypted, wrongKey)).rejects.toThrow()
    })

    it('should fail to decrypt with corrupted ciphertext', async () => {
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'example.com',
            username: 'user',
            password: 'pass',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)

      // Corrupt the ciphertext
      const corruptedCiphertext = encrypted.ciphertext.slice(0, -10) + 'CORRUPTED!'
      const corrupted = {
        ciphertext: corruptedCiphertext,
        iv: encrypted.iv
      }

      // Decryption should fail
      await expect(decryptVault(corrupted, testKey)).rejects.toThrow()
    })

    it('should fail to decrypt with corrupted IV', async () => {
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'example.com',
            username: 'user',
            password: 'pass',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)

      // Corrupt the IV
      const corruptedIv = encrypted.iv.slice(0, -5) + 'BAD=='
      const corrupted = {
        ciphertext: encrypted.ciphertext,
        iv: corruptedIv
      }

      // Decryption should fail
      await expect(decryptVault(corrupted, testKey)).rejects.toThrow()
    })

    it('should fail with invalid base64 ciphertext', async () => {
      const invalidEncrypted = {
        ciphertext: 'not-valid-base64!!!',
        iv: 'also-not-valid!!!'
      }

      await expect(decryptVault(invalidEncrypted, testKey)).rejects.toThrow()
    })
  })

  describe('encryptVault', () => {
    it('should return base64-encoded ciphertext and IV', async () => {
      const vaultData: VaultData = {
        entries: [],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)

      // Check that ciphertext and IV are valid base64 strings
      expect(typeof encrypted.ciphertext).toBe('string')
      expect(typeof encrypted.iv).toBe('string')
      expect(encrypted.ciphertext.length).toBeGreaterThan(0)
      expect(encrypted.iv.length).toBeGreaterThan(0)

      // Verify they are valid base64 (should not throw)
      expect(() => atob(encrypted.ciphertext)).not.toThrow()
      expect(() => atob(encrypted.iv)).not.toThrow()
    })

    it('should use 12-byte IV for GCM mode', async () => {
      const vaultData: VaultData = {
        entries: [],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)

      // Decode IV and check length
      const ivBytes = atob(encrypted.iv)
      expect(ivBytes.length).toBe(12)
    })

    it('should preserve dates correctly', async () => {
      const testDate = new Date('2024-06-15T10:30:00.000Z')
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'example.com',
            username: 'user',
            password: 'pass',
            createdAt: testDate,
            updatedAt: testDate
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, testKey)
      const decrypted = await decryptVault(encrypted, testKey)

      expect(new Date(decrypted.entries[0].createdAt)).toEqual(testDate)
      expect(new Date(decrypted.entries[0].updatedAt)).toEqual(testDate)
    })
  })

  describe('integration with deriveKey', () => {
    it('should work end-to-end with password-based key derivation', async () => {
      const password = 'userMasterPassword123!'
      const salt = generateSalt()

      // Derive key from password
      const key = await deriveKey(password, salt)

      // Encrypt vault
      const vaultData: VaultData = {
        entries: [
          {
            id: '1',
            site: 'github.com',
            username: 'developer',
            password: 'secureGitHubPassword',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, key)

      // Derive the same key again (simulate user logging in)
      const derivedKeyAgain = await deriveKey(password, salt)

      // Decrypt with re-derived key
      const decrypted = await decryptVault(encrypted, derivedKeyAgain)

      expect(decrypted).toEqual(vaultData)
    })

    it('should fail when using different password to derive key', async () => {
      const password1 = 'correctPassword'
      const password2 = 'wrongPassword'
      const salt = generateSalt()

      const key1 = await deriveKey(password1, salt)

      const vaultData: VaultData = {
        entries: [{ id: '1', site: 'test.com', username: 'user', password: 'pass', createdAt: new Date(), updatedAt: new Date() }],
        version: 1
      }

      const encrypted = await encryptVault(vaultData, key1)

      // Try to decrypt with key derived from wrong password
      const key2 = await deriveKey(password2, salt)

      await expect(decryptVault(encrypted, key2)).rejects.toThrow()
    })
  })
})
