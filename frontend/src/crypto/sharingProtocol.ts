import { arrayBufferToBase64, base64ToArrayBuffer } from './utils'

const SHARING_ALGORITHM = 'ECDH-P256-HKDF-AES256GCM'
const AES_GCM_KEY_LENGTH = 256

export interface ShareEnvelope {
  senderEphemeralPublicKey: string
  wrappedCek: string
  wrappedCekIv: string
  payloadCiphertext: string
  payloadIv: string
  aad: string
  algorithm: typeof SHARING_ALGORITHM
  version: number
}

export interface ShareAad {
  from_user_id: string
  to_user_id: string
  item_id: string
  version: number
}

export function buildCanonicalAad(fields: ShareAad): string {
  return JSON.stringify({
    from_user_id: fields.from_user_id,
    item_id: fields.item_id,
    to_user_id: fields.to_user_id,
    version: fields.version,
  })
}

export function parseCanonicalAad(aadStr: string): ShareAad {
  const parsed = JSON.parse(aadStr)
  const requiredKeys = ['from_user_id', 'to_user_id', 'item_id', 'version']
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`AAD missing required field: ${key}`)
    }
  }
  return parsed as ShareAad
}

export async function generateUserSharingKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits']
  )
}

export async function exportSharingPublicKeyBase64(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey)
  return arrayBufferToBase64(spki)
}

export async function exportSharingPrivateKeyPkcs8(privateKey: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('pkcs8', privateKey)
}

export async function protectSharingPrivateKey(
  privateKeyPkcs8: ArrayBuffer,
  vaultKey: CryptoKey
): Promise<{ encryptedPrivateKey: string; encryptedPrivateKeyIv: string }> {
  // TODO(user): Re-wrap this with a master-derived key once that key is available at sharing setup time.
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    vaultKey,
    privateKeyPkcs8
  )

  return {
    encryptedPrivateKey: arrayBufferToBase64(ciphertext),
    encryptedPrivateKeyIv: arrayBufferToBase64(iv),
  }
}

export async function unprotectSharingPrivateKey(
  encryptedPrivateKeyBase64: string,
  encryptedPrivateKeyIvBase64: string,
  vaultKey: CryptoKey
): Promise<CryptoKey> {
  const rawPrivateKey = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(base64ToArrayBuffer(encryptedPrivateKeyIvBase64)),
    },
    vaultKey,
    base64ToArrayBuffer(encryptedPrivateKeyBase64)
  )

  return crypto.subtle.importKey(
    'pkcs8',
    rawPrivateKey,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits']
  )
}

export async function importSharingPublicKeyBase64(spkiBase64: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(spkiBase64)
  return crypto.subtle.importKey(
    'spki',
    keyData,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  )
}

async function deriveKek(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey,
  aad: string
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: remotePublicKey,
    },
    localPrivateKey,
    256
  )

  const sharedSecret = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])

  const aadHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(aad))
  const aadHashHex = Array.from(new Uint8Array(aadHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const info = new TextEncoder().encode(`vaultkey-share-kek:v1:${aadHashHex}`)

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info,
    },
    sharedSecret,
    {
      name: 'AES-GCM',
      length: AES_GCM_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function createShareEnvelope(input: {
  payloadJson: string
  recipientPublicKeyBase64: string
  aad: ShareAad
  version?: number
}): Promise<ShareEnvelope> {
  const aad = buildCanonicalAad(input.aad)
  const payloadIv = new Uint8Array(12)
  const wrappedCekIv = new Uint8Array(12)
  crypto.getRandomValues(payloadIv)
  crypto.getRandomValues(wrappedCekIv)

  const cek = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: AES_GCM_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt']
  )

  const payloadCiphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: payloadIv,
      additionalData: new TextEncoder().encode(aad),
    },
    cek,
    new TextEncoder().encode(input.payloadJson)
  )

  const senderEphemeralKeyPair = await generateUserSharingKeyPair()
  const recipientPublicKey = await importSharingPublicKeyBase64(input.recipientPublicKeyBase64)

  const kek = await deriveKek(senderEphemeralKeyPair.privateKey, recipientPublicKey, aad)

  const rawCek = await crypto.subtle.exportKey('raw', cek)
  const wrappedCek = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: wrappedCekIv,
      additionalData: new TextEncoder().encode(aad),
    },
    kek,
    rawCek
  )

  const senderEphemeralPublicKey = await exportSharingPublicKeyBase64(senderEphemeralKeyPair.publicKey)

  return {
    senderEphemeralPublicKey,
    wrappedCek: arrayBufferToBase64(wrappedCek),
    wrappedCekIv: arrayBufferToBase64(wrappedCekIv),
    payloadCiphertext: arrayBufferToBase64(payloadCiphertext),
    payloadIv: arrayBufferToBase64(payloadIv),
    aad,
    algorithm: SHARING_ALGORITHM,
    version: input.version ?? 1,
  }
}

export async function decryptShareEnvelope(input: {
  senderEphemeralPublicKeyBase64: string
  wrappedCekBase64: string
  wrappedCekIvBase64: string
  payloadCiphertextBase64: string
  payloadIvBase64: string
  aad: string
  recipientPrivateKey: CryptoKey
  expectedRecipientUserId: string
}): Promise<string> {
  const aadFields = parseCanonicalAad(input.aad)
  if (aadFields.to_user_id !== input.expectedRecipientUserId) {
    throw new Error('AAD recipient does not match authenticated user')
  }

  const senderPublicKey = await importSharingPublicKeyBase64(input.senderEphemeralPublicKeyBase64)
  const kek = await deriveKek(input.recipientPrivateKey, senderPublicKey, input.aad)

  const rawCek = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(base64ToArrayBuffer(input.wrappedCekIvBase64)),
      additionalData: new TextEncoder().encode(input.aad),
    },
    kek,
    base64ToArrayBuffer(input.wrappedCekBase64)
  )

  const cek = await crypto.subtle.importKey(
    'raw',
    rawCek,
    {
      name: 'AES-GCM',
      length: AES_GCM_KEY_LENGTH,
    },
    false,
    ['decrypt']
  )

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(base64ToArrayBuffer(input.payloadIvBase64)),
      additionalData: new TextEncoder().encode(input.aad),
    },
    cek,
    base64ToArrayBuffer(input.payloadCiphertextBase64)
  )

  return new TextDecoder().decode(plaintext)
}