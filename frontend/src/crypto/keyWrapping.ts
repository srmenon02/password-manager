import { arrayBufferToBase64, base64ToArrayBuffer } from './vaultEncryption'

/**
 * Generates a random vault encryption key
 * @returns A new AES-256-GCM key for encrypting the vault
 */
export async function generateVaultEncryptionKey(): Promise<CryptoKey> {
  try {
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    )
  } catch (e) {
    throw new Error('Vault Encryption Key generation failed: ' + e)
  }
}

/**
 * Wraps (encrypts) the vault encryption key with the derived key
 * @param vaultKey - The vault encryption key to protect
 * @param derivedKey - The key derived from the user's password
 * @returns Encrypted vault key + IV
 */
export async function wrapKey(
  vaultKey: CryptoKey,
  derivedKey: CryptoKey
): Promise<{ protectedKey: string; iv: string }> {
  const rawVaultKey = await crypto.subtle.exportKey('raw', vaultKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptVaultKey = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    derivedKey,
    rawVaultKey
  );
  try {
    return {
      protectedKey: arrayBufferToBase64(encryptVaultKey),
      iv: arrayBufferToBase64(iv.buffer),
    }
  } catch (e) {
    throw new Error('Key wrapping failed: ' + e)
  }
}

/**
 * Unwraps (decrypts) the vault encryption key using the derived key
 * @param protectedKey - The encrypted vault key (base64)
 * @param derivedKey - The key derived from the user's password
 * @param iv - The IV used during wrapping (base64)
 * @returns The unwrapped vault encryption key
 */
export async function unwrapKey(
  protectedKey: string,
  derivedKey: CryptoKey,
  iv: string
): Promise<CryptoKey> {
  try {
    // 1. Decode base64 protected key and IV
    const protectedKeyBuffer = base64ToArrayBuffer(protectedKey)
    const ivBuffer = base64ToArrayBuffer(iv)
    
    // 2. Decrypt with derived key using AES-GCM
    const rawVaultKey = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ivBuffer)
      },
      derivedKey,
      protectedKeyBuffer
    )
    
    // 3. Import raw key material as CryptoKey
    return await crypto.subtle.importKey(
      'raw',
      rawVaultKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      true, // extractable (so it can be re-wrapped during password change)
      ['encrypt', 'decrypt']
    )
  } catch (e) {
    throw new Error('Key unwrapping failed (wrong password?): ' + e)
  }
}
