// Vault data structures
export interface VaultEntry {
  id: string
  site: string
  username: string
  password: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface VaultData {
  entries: VaultEntry[]
  version: number
}

// Encrypted data structures
export interface EncryptedVault {
  ciphertext: string // Base64 encoded
  iv: string // Base64 encoded
}

// API request/response types
export interface RegisterRequest {
  email: string
  salt: string // Base64 encoded, 16 bytes
  auth_verifier: string // SRP verifier as decimal string
  protected_key: string // Base64 encoded, 48 bytes (32-byte key + 16-byte GCM tag)
  protected_key_iv: string // Base64 encoded, 12 bytes
  encrypted_blob: string // Base64 encoded
  vault_iv: string // Base64 encoded, 12 bytes
}

export interface RegisterResponse {
  user_id: string // UUID
  token: string // JWT
}

// Login types (SRP-6a protocol)
export interface LoginInitRequest {
  email: string
  client_ephemeral_a: string // Base64 encoded (A = g^a mod N)
}

export interface LoginInitResponse {
  session_id: string // UUID for correlating init and verify
  salt: string // Base64 encoded (user's PBKDF2 salt)
  server_ephemeral_b: string // Base64 encoded (B = kv + g^b mod N)
}

export interface LoginVerifyRequest {
  session_id: string // UUID from init response
  client_proof_m1: string // Base64 encoded (M1 = H(H(N) XOR H(g), H(I), s, A, B, K))
}

export interface LoginVerifyResponse {
  server_proof_m2: string // Base64 encoded (M2 = H(A, M1, K))
  token: string // JWT
}

export interface VaultResponse {
  protected_key: string // Base64 encoded
  protected_key_iv: string // Base64 encoded
  encrypted_blob: string // Base64 encoded
  vault_iv: string // Base64 encoded
  updated_at: string // ISO timestamp
}

export interface VaultUpdateRequest {
  encrypted_blob: string
  vault_iv: string
}

// Secure sharing protocol (Step 30)
export type SharingAlgorithm = 'ECDH-P256-HKDF-AES256GCM'

export interface SharingKeyRegistrationRequest {
  sharing_public_key: string // SPKI base64
  encrypted_private_key: string // PKCS8 encrypted with master-derived key (base64)
  encrypted_private_key_iv: string // Base64 encoded, 12 bytes
  algorithm: SharingAlgorithm
}

export interface ShareInitRequest {
  recipient_email: string
}

export interface ShareInitResponse {
  recipient_user_id: string
  recipient_sharing_public_key: string // SPKI base64
  recipient_sharing_algorithm: SharingAlgorithm
  recipient_key_fingerprint: string
}

export interface ShareCreateRequest {
  to_user_id: string
  sender_ephemeral_public_key: string // SPKI base64
  wrapped_cek: string // Base64
  wrapped_cek_iv: string // Base64, 12 bytes
  payload_ciphertext: string // Base64
  payload_iv: string // Base64, 12 bytes
  aad: string // JSON string used as AES-GCM AAD
  algorithm: SharingAlgorithm
  version: number
}

export interface ShareCreateResponse {
  share_id: string
  shared_at: string
}

export interface SharedInboxItem {
  share_id: string
  from_user_id: string
  to_user_id: string
  sender_ephemeral_public_key: string
  wrapped_cek: string
  wrapped_cek_iv: string
  payload_ciphertext: string
  payload_iv: string
  aad: string
  algorithm: SharingAlgorithm
  version: number
  shared_at: string
}

export interface BreachResultInput {
  entry_id: string
  password_sha1: string
  breached: boolean
  last_seen_count?: number | null
}

export interface BreachResultResponse {
  entry_id: string
  breached: boolean
  checked_at: string
  last_seen_count?: number | null
}

export interface BreachResultsSaveRequest {
  results: BreachResultInput[]
}

export interface BreachResultsListResponse {
  results: BreachResultResponse[]
}

// Error response
export interface ErrorResponse {
  error: string
  message: string
}
