
import type { VaultData, EncryptedVault } from '@shared/types'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomIv,
} from './utils'
import { deserializeVaultData, serializeVaultData } from '@/models/vault'

/**
 * Encrypts vault data using AES-256-GCM
 * @param data - The vault data to encrypt
 * @param key - The encryption key (from deriveKey or vault_encryption_key)
 * @returns Encrypted vault with ciphertext and IV
 */
export async function encryptVault(
  data: VaultData,
  key: CryptoKey
): Promise<EncryptedVault> {
  const serializedVault = serializeVaultData(data)
  const plainText = new TextEncoder().encode(serializedVault)
  const iv = generateRandomIv()
  const ivForCrypto = new Uint8Array(iv)
  const ciphertext = await crypto.subtle.encrypt(
    {
        name: 'AES-GCM',
        iv: ivForCrypto,
        tagLength: 128,
    },
    key,
    plainText
  )

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(ivForCrypto),
  }
}

/**
 * Decrypts vault data using AES-256-GCM
 * @param encrypted - The encrypted vault (ciphertext + IV)
 * @param key - The decryption key
 * @returns Decrypted vault data
 * @throws Error if decryption fails (wrong password or corrupted data)
 */
export async function decryptVault(
  encrypted: EncryptedVault,
  key: CryptoKey
): Promise<VaultData> {
  const decodedCiphertext = base64ToArrayBuffer(encrypted.ciphertext)
  const decodedIv = base64ToArrayBuffer(encrypted.iv)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodedIv,
      tagLength: 128,
    },
    key,
    decodedCiphertext
  )
  const decryptedText = new TextDecoder().decode(decrypted)

  try {
    return deserializeVaultData(decryptedText)
  } catch (error) {
    throw new Error('Vault decryption failed: ' + error)
  }
}
export { arrayBufferToBase64, base64ToArrayBuffer } from './utils'
