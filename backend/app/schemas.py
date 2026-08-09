import base64
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
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

    @field_validator("salt")
    @classmethod
    def validate_salt(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("salt must be valid base64") from exc
        if len(payload) != 16:
            raise ValueError("salt must decode to exactly 16 bytes")
        return value

    @field_validator("auth_verifier")
    @classmethod
    def validate_auth_verifier(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("auth_verifier must be a decimal string")
        return value

    @field_validator("protected_key")
    @classmethod
    def validate_protected_key(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("protected_key must be valid base64") from exc
        if len(payload) != 48:
            raise ValueError("protected_key must decode to exactly 48 bytes")
        return value

    @field_validator("protected_key_iv", "vault_iv")
    @classmethod
    def validate_iv(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("IV must be valid base64") from exc
        if len(payload) != 12:
            raise ValueError("IV must decode to exactly 12 bytes")
        return value

    @field_validator("encrypted_blob")
    @classmethod
    def validate_encrypted_blob(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("encrypted_blob must be valid base64") from exc
        return value


class RegisterResponse(BaseModel):
    user_id: str  # UUID
    token: str  # JWT


class LoginInitRequest(BaseModel):
    email: EmailStr
    client_ephemeral_a: str  # Base64 encoded (A = g^a mod N)

    @field_validator("client_ephemeral_a")
    @classmethod
    def validate_client_ephemeral_a(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("client_ephemeral_a must be valid base64") from exc
        return value


class LoginInitResponse(BaseModel):
    session_id: str  # UUID
    salt: str  # Base64 encoded
    server_ephemeral_b: str  # Base64 encoded (B = kv + g^b mod N)


class LoginVerifyRequest(BaseModel):
    session_id: str  # UUID
    client_proof_m1: str  # Base64 encoded (M1 = H(H(N) XOR H(g), H(I), s, A, B, K))

    @field_validator("client_proof_m1")
    @classmethod
    def validate_client_proof_m1(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("client_proof_m1 must be valid base64") from exc
        return value


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

    @field_validator("encrypted_blob")
    @classmethod
    def validate_encrypted_blob(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("encrypted_blob must be valid base64") from exc
        return value

    @field_validator("vault_iv")
    @classmethod
    def validate_vault_iv(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("vault_iv must be valid base64") from exc
        if len(payload) != 12:
            raise ValueError("vault_iv must decode to exactly 12 bytes")
        return value


class VaultUpdateResponse(BaseModel):
    updated_at: datetime

class ChangePasswordRequest(BaseModel):
    current_password_proof: str  # Proof client knows current password
    new_salt: str  # Base64 encoded
    new_auth_verifier: str  # New SRP verifier
    new_protected_key: str  # Base64 encoded, vault_encryption_key re-wrapped
    new_protected_key_iv: str  # Base64 encoded

    @field_validator("current_password_proof")
    @classmethod
    def validate_current_password_proof(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("current_password_proof must be valid base64") from exc
        if len(payload) != 32:
            raise ValueError("current_password_proof must decode to exactly 32 bytes")
        return value

    @field_validator("new_salt")
    @classmethod
    def validate_new_salt(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("new_salt must be valid base64") from exc
        if len(payload) != 16:
            raise ValueError("new_salt must decode to exactly 16 bytes")
        return value

    @field_validator("new_auth_verifier")
    @classmethod
    def validate_new_auth_verifier(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("new_auth_verifier must be a decimal string")
        return value

    @field_validator("new_protected_key")
    @classmethod
    def validate_new_protected_key(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("new_protected_key must be valid base64") from exc
        if len(payload) != 48:
            raise ValueError("new_protected_key must decode to exactly 48 bytes")
        return value

    @field_validator("new_protected_key_iv")
    @classmethod
    def validate_new_protected_key_iv(cls, value: str) -> str:
        try:
            payload = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("new_protected_key_iv must be valid base64") from exc
        if len(payload) != 12:
            raise ValueError("new_protected_key_iv must decode to exactly 12 bytes")
        return value


# ============= Error Handling =============
class ErrorResponse(BaseModel):
    status: str = "error"
    message: str


# ============= Database Models (for response) =============
class UserBase(BaseModel):
    email: EmailStr


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class VaultBase(BaseModel):
    protected_key: bytes
    protected_key_iv: bytes
    encrypted_blob: bytes
    vault_iv: bytes


class VaultInDB(VaultBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class BreachResultInput(BaseModel):
    entry_id: str
    password_sha1: str = Field(..., min_length=40, max_length=40)
    breached: bool
    last_seen_count: Optional[int] = None

    @field_validator("password_sha1")
    @classmethod
    def validate_sha1(cls, v: str) -> str:
        if not all(c in "0123456789abcdefABCDEF" for c in v):
            raise ValueError("password_sha1 must be a hex string")
        return v.upper()


class BreachResultsSaveRequest(BaseModel):
    results: List[BreachResultInput]


class BreachResultResponse(BaseModel):
    entry_id: str
    breached: bool
    checked_at: datetime
    last_seen_count: Optional[int] = None

    class Config:
        from_attributes = True


class BreachResultsListResponse(BaseModel):
    results: List[BreachResultResponse]