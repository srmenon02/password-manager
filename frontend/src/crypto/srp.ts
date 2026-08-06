import srp from 'secure-remote-password/client'

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function generateSRPVerifier(
  email: string,
  password: string,
  salt: Uint8Array
): Promise<string> {
  const saltHex = bytesToHex(salt)

  const privateKey = srp.derivePrivateKey(saltHex, email, password)
  const verifierHex = srp.deriveVerifier(privateKey)

  // Backend expects verifier as a decimal string, not base64
  return BigInt('0x' + verifierHex).toString(10)
}

export function generateEphemeralA(): { a: string, A: string } {
  const { secret, public: pub } = srp.generateEphemeral()

  return {
    a: bytesToBase64(hexToBytes(secret)),
    A: bytesToBase64(hexToBytes(pub))
  }
}