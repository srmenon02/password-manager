export function arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  } catch {
    throw new Error('Invalid base64 input')
  }
}

export function generateRandomIv(length = 12): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function generateRandomSalt(length = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}
