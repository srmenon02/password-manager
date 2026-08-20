export interface VaultEntry {
    id: string;
    site: string;
    username: string;
    password: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface VaultData {
    entries: VaultEntry[];
    version: number;
}
export interface EncryptedVault {
    ciphertext: string;
    iv: string;
}
export interface RegisterRequest {
    email: string;
    salt: string;
    auth_verifier: string;
    protected_key: string;
    protected_key_iv: string;
    encrypted_blob: string;
    vault_iv: string;
}
export interface RegisterResponse {
    user_id: string;
    token: string;
}
export interface LoginInitRequest {
    email: string;
    client_ephemeral_a: string;
}
export interface LoginInitResponse {
    session_id: string;
    salt: string;
    server_ephemeral_b: string;
}
export interface LoginVerifyRequest {
    session_id: string;
    client_proof_m1: string;
}
export interface LoginVerifyResponse {
    server_proof_m2: string;
    token: string;
}
export interface VaultResponse {
    protected_key: string;
    protected_key_iv: string;
    encrypted_blob: string;
    vault_iv: string;
    updated_at: string;
}
export interface VaultUpdateRequest {
    encrypted_blob: string;
    vault_iv: string;
}
export type SharingAlgorithm = 'ECDH-P256-HKDF-AES256GCM';
export type SharePermission = 'read_only' | 'read_write';
export interface SharingKeyRegistrationRequest {
    sharing_public_key: string;
    encrypted_private_key: string;
    encrypted_private_key_iv: string;
    algorithm: SharingAlgorithm;
}
export interface ShareInitRequest {
    recipient_email: string;
}
export interface ShareInitResponse {
    recipient_user_id: string;
    recipient_sharing_public_key: string;
    recipient_sharing_algorithm: SharingAlgorithm;
    recipient_key_fingerprint: string;
}
export interface ShareCreateRequest {
    to_user_id: string;
    sender_ephemeral_public_key: string;
    wrapped_cek: string;
    wrapped_cek_iv: string;
    payload_ciphertext: string;
    payload_iv: string;
    aad: string;
    algorithm: SharingAlgorithm;
    version: number;
    permission: SharePermission;
}
export interface ShareCreateResponse {
    share_id: string;
    shared_at: string;
}
export interface SharedInboxItem {
    share_id: string;
    from_user_id: string;
    from_user_email?: string;
    to_user_id: string;
    sender_ephemeral_public_key: string;
    wrapped_cek: string;
    wrapped_cek_iv: string;
    payload_ciphertext: string;
    payload_iv: string;
    aad: string;
    algorithm: SharingAlgorithm;
    version: number;
    permission: SharePermission;
    item_label?: string;
    shared_at: string;
}
export interface BreachResultInput {
    entry_id: string;
    password_sha1: string;
    breached: boolean;
    last_seen_count?: number | null;
}
export interface BreachResultResponse {
    entry_id: string;
    breached: boolean;
    checked_at: string;
    last_seen_count?: number | null;
}
export interface BreachResultsSaveRequest {
    results: BreachResultInput[];
}
export interface BreachResultsListResponse {
    results: BreachResultResponse[];
}
export interface AuditLogEntry {
    id: string;
    action: string;
    metadata: Record<string, string | number | boolean | null>;
    previous_hash?: string | null;
    entry_hash: string;
    occurred_at: string;
}
export interface AuditLogListResponse {
    entries: AuditLogEntry[];
}
export interface AuditLogVerifyResponse {
    is_valid: boolean;
    checked_entries: number;
    broken_entry_id?: string | null;
    expected_previous_hash?: string | null;
    actual_previous_hash?: string | null;
    expected_hash?: string | null;
    actual_hash?: string | null;
    latest_hash?: string | null;
}
export interface ErrorResponse {
    error: string;
    message: string;
}
//# sourceMappingURL=types.d.ts.map