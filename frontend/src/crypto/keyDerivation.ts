
import { generateRandomSalt } from './utils'

/**
 * Derives an AES-256-GCM key from a master password and salt
 * @param password - The user's master password
 * @param salt - 16-byte salt (unique per user)
 * @returns CryptoKey for AES-GCM encryption/decryption
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    try{
        const normalizedSalt = Uint8Array.from(salt);
        const derivedKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: normalizedSalt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
        );
        return derivedKey;
    } catch (error) {
        throw new Error('Key derivation failed: ' + error);
    }
}

/**
 * Generates a cryptographically secure random salt
 * @returns 16-byte (128-bit) random salt
 */
export function generateSalt(): Uint8Array {
    try{
        return generateRandomSalt(16)
    }
    catch (error) {
        throw new Error('Salt generation failed: ' + error)
    }
}
