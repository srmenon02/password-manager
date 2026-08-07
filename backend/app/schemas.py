from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# ============= Vault Data Structures =============
class VaultEntry(BaseModel):
    id: str
    site: str
    username: str
    password: str
    notes: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


class VaultData(BaseModel):
    entries: List[VaultEntry]
    version: int


class EncryptedVault(BaseModel):
    ciphertext: str  # Base64 encoded
    iv: str  # Base64 encoded


# ============= Authentication =============
class RegisterRequest(BaseModel):
    email: EmailStr
    salt: str  # Base64 encoded, 16 bytes
    auth_verifier: str  # SRP verifier as decimal string
    protected_key: str  # Base64 encoded, 48 bytes (32-byte key + 16-byte GCM tag)
    protected_key_iv: str  # Base64 encoded, 12 bytes
    encrypted_blob: str  # Base64 encoded, variable size
    vault_iv: str  # Base64 encoded, 12 bytes


class RegisterResponse(BaseModel):
    user_id: str  # UUID
    token: str  # JWT


class LoginInitRequest(BaseModel):
    email: EmailStr
    client_ephemeral_a: str  # Base64 encoded (A = g^a mod N)


class LoginInitResponse(BaseModel):
    session_id: str  # UUID
    salt: str  # Base64 encoded
    server_ephemeral_b: str  # Base64 encoded (B = kv + g^b mod N)


class LoginVerifyRequest(BaseModel):
    session_id: str  # UUID
    client_proof_m1: str  # Base64 encoded (M1 = H(H(N) XOR H(g), H(I), s, A, B, K))


class LoginVerifyResponse(BaseModel):
    server_proof_m2: str  # Base64 encoded (M2 = H(A, M1, K))
    token: str  # JWT


# ============= Vault Operations =============
class VaultResponse(BaseModel):
    protected_key: str  # Base64 encoded
    protected_key_iv: str  # Base64 encoded
    encrypted_blob: str  # Base64 encoded
    vault_iv: str  # Base64 encoded
    updated_at: datetime


class VaultUpdateRequest(BaseModel):
    encrypted_blob: str  # Base64 encoded
    vault_iv: str  # Base64 encoded


class VaultUpdateResponse(BaseModel):
    updated_at: datetime

class ChangePasswordRequest(BaseModel):
    current_password_proof: str  # Proof client knows current password
    new_salt: str  # Base64 encoded
    new_auth_verifier: str  # New SRP verifier
    new_protected_key: str  # Base64 encoded, vault_encryption_key re-wrapped
    new_protected_key_iv: str  # Base64 encoded


# ============= Error Handling =============
class ErrorResponse(BaseModel):
    status: str = "error"
    message: str


# ============= Database Models (for response) =============
class UserBase(BaseModel):
    email: EmailStr


class UserResponse(UserBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VaultBase(BaseModel):
    protected_key: bytes
    protected_key_iv: bytes
    encrypted_blob: bytes
    vault_iv: bytes


class VaultInDB(VaultBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
