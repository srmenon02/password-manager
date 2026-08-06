
import type { VaultData, EncryptedVault } from '@shared/types'

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
  const serializedVault = JSON.stringify(data);
  const plainText = new TextEncoder().encode(serializedVault);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128,
    },
    key,
    plainText
  );
  try{
    return {
        ciphertext: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv.buffer),
    };
  }
  catch (error) {
    throw new Error('Vault encryption failed: ' + error);
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
  const decodedCiphertext = base64ToArrayBuffer(encrypted.ciphertext);
  const decodedIv = base64ToArrayBuffer(encrypted.iv);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodedIv,
      tagLength: 128,
    },
    key,
    decodedCiphertext
  );
  const decryptedText = new TextDecoder().decode(decrypted);
  try {
    return JSON.parse(decryptedText, (key, value) => {
      if (key === 'createdAt' || key === 'updatedAt') {
        return new Date(value);
      }
      return value;
    });
  } catch (error) {
    throw new Error('Vault decryption failed: ' + error);
  }
}

// Helper functions (you can implement or use a library)
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  try{
    return btoa(binary);
  }
  catch (error) {
    throw new Error('Base64 encoding failed: ' + error);
  }
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  try{
    return bytes.buffer;
  }
  catch (error) {
    throw new Error('Base64 decoding failed: ' + error);
  }
}
