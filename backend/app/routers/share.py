import base64
from collections.abc import Set
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
import json

from app.auth import get_current_user
from app.database import get_db
from app.models import ShareRevocationAudit, SharedItem, User
from app.schemas import (
    ErrorResponse,
    ShareCreateRequest,
    ShareCreateResponse,
    SharedInboxItemResponse,
    SharedInboxResponse,
    ShareInitRequest,
    ShareInitResponse,
    SharingKeyRegistrationRequest,
    SharingKeyResponse,
)

router = APIRouter()
ALLOWED_SHARING_KEY_ALGORITHMS: Set[str] = {'ECDH-P256-HKDF-AES256GCM'}

import hashlib

def compute_key_fingerprint(public_key_b64: str, algorithm: str) -> str:
    digest_input = f"{algorithm}:{public_key_b64}".encode("utf-8")
    return hashlib.sha256(digest_input).hexdigest()

@router.post(
    "/keys",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
    },
)

async def register_sharing_keys(
    request: SharingKeyRegistrationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.algorithm not in ALLOWED_SHARING_KEY_ALGORITHMS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "unsupported_algorithm", "message": f"Algorithm must be one of {sorted(ALLOWED_SHARING_KEY_ALGORITHMS)}"},
        )

    try:
        sharing_private_key_encrypted = base64.b64decode(request.encrypted_private_key)
        sharing_private_key_iv = base64.b64decode(request.encrypted_private_key_iv)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_encoding", "message": "Invalid base64 for sharing key material"},
        )

    current_user.sharing_public_key = request.sharing_public_key
    current_user.sharing_private_key_encrypted = sharing_private_key_encrypted
    current_user.sharing_private_key_iv = sharing_private_key_iv
    current_user.sharing_key_algorithm = request.algorithm
    db.commit()


@router.get(
    "/keys",
    response_model=SharingKeyResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
        400: {"model": ErrorResponse, "description": "Recipient has no sharing key"},
    },
)
async def get_sharing_keys(
    current_user: User = Depends(get_current_user),
):
    if not current_user.sharing_public_key or not current_user.sharing_key_algorithm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "recipient_missing_key", "message": "You have not configured sharing keys"},
        )

    if not current_user.sharing_private_key_encrypted or not current_user.sharing_private_key_iv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "recipient_missing_private_key", "message": "Your encrypted sharing private key is missing"},
        )

    return SharingKeyResponse(
        sharing_public_key=current_user.sharing_public_key,
        encrypted_private_key=base64.b64encode(current_user.sharing_private_key_encrypted).decode("utf-8"),
        encrypted_private_key_iv=base64.b64encode(current_user.sharing_private_key_iv).decode("utf-8"),
        algorithm=current_user.sharing_key_algorithm,
    )


@router.post(
    "/init",
    response_model=ShareInitResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Recipient not found"},
        400: {"model": ErrorResponse, "description": "Recipient has no sharing key"},
    },
)
async def init_share(
    request: ShareInitRequest,
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipient_email = request.recipient_email.strip().lower()
    recipient = db.query(User).filter(func.lower(User.email) == recipient_email).first()

    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "recipient_not_found", "message": "Recipient email not found"},
        )

    if not recipient.sharing_public_key or not recipient.sharing_key_algorithm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "recipient_missing_key", "message": "Recipient has not configured sharing keys"},
        )

    fingerprint = compute_key_fingerprint(recipient.sharing_public_key, recipient.sharing_key_algorithm)

    return ShareInitResponse(
        recipient_user_id=str(recipient.id),
        recipient_sharing_public_key=recipient.sharing_public_key,
        recipient_sharing_algorithm=recipient.sharing_key_algorithm,
        recipient_key_fingerprint=fingerprint,
    )


@router.post(
    "",
    response_model=ShareCreateResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
    },
)
async def create_share(
    request: ShareCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if str(current_user.id) == request.to_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_recipient", "message": "Cannot share with yourself"},
        )

    recipient = db.query(User).filter(User.id == request.to_user_id).first()
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "recipient_not_found", "message": "Recipient user does not exist"},
        )

    if request.permission not in ALLOWED_SHARE_PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_permission", "message": "permission must be read_only or read_write"},
        )

    validate_and_parse_aad(
        request.aad,
        current_user_id=str(current_user.id),
        recipient_id=str(recipient.id),
        expected_version=request.version,
        expected_permission=request.permission,
    )

    try:
        wrapped_cek_bytes = base64.b64decode(request.wrapped_cek)
        wrapped_cek_iv_bytes = base64.b64decode(request.wrapped_cek_iv)
        payload_ciphertext_bytes = base64.b64decode(request.payload_ciphertext)
        payload_iv_bytes = base64.b64decode(request.payload_iv)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_encoding", "message": "Invalid base64 payload for share record"},
        )

    share = SharedItem(
        id=uuid.uuid4(),
        from_user_id=current_user.id,
        to_user_id=recipient.id,
        encrypted_item=payload_ciphertext_bytes,
        sender_ephemeral_public_key=request.sender_ephemeral_public_key,
        wrapped_cek=wrapped_cek_bytes,
        wrapped_cek_iv=wrapped_cek_iv_bytes,
        payload_iv=payload_iv_bytes,
        aad=request.aad,
        algorithm=request.algorithm,
        version=request.version,
        permission=request.permission,
    )

    db.add(share)
    db.commit()
    db.refresh(share)

    return ShareCreateResponse(share_id=str(share.id), shared_at=share.shared_at)


REQUIRED_AAD_FIELDS = {"from_user_id", "to_user_id", "item_id", "version", "permission"}
ALLOWED_SHARE_PERMISSIONS = {"read_only", "read_write"}

def validate_and_parse_aad(aad_str: str, current_user_id: str, recipient_id: str, expected_version: int, expected_permission: str | None = None) -> dict:
    try:
        aad = json.loads(aad_str)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_aad", "message": "AAD must be valid JSON"},
        )

    if not isinstance(aad, dict) or set(aad.keys()) != REQUIRED_AAD_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_aad_schema", "message": f"AAD must contain exactly: {sorted(REQUIRED_AAD_FIELDS)}"},
        )

    if aad["from_user_id"] != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "aad_sender_mismatch", "message": "AAD from_user_id does not match authenticated user"},
        )

    if aad["to_user_id"] != recipient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "aad_recipient_mismatch", "message": "AAD to_user_id does not match recipient"},
        )

    if aad["version"] != expected_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "aad_version_mismatch", "message": "AAD version does not match request version"},
        )

    permission = aad.get("permission")
    if permission not in ALLOWED_SHARE_PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_permission", "message": "AAD permission must be read_only or read_write"},
        )

    if expected_permission is not None and permission != expected_permission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "permission_mismatch", "message": "AAD permission does not match request permission"},
        )

    return aad

@router.get(
    "/shared-with-me",
    response_model=SharedInboxResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
    },
)
async def list_shared_with_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(SharedItem)
        .filter(SharedItem.to_user_id == current_user.id, SharedItem.revoked_at.is_(None))
        .order_by(SharedItem.shared_at.desc())
        .all()
    )

    items = []
    for row in rows:
        if not all([row.sender_ephemeral_public_key, row.wrapped_cek, row.wrapped_cek_iv, row.payload_iv, row.aad, row.algorithm]):
            continue

        items.append(
            SharedInboxItemResponse(
                share_id=str(row.id),
                from_user_id=str(row.from_user_id),
                to_user_id=str(row.to_user_id),
                sender_ephemeral_public_key=row.sender_ephemeral_public_key,
                wrapped_cek=base64.b64encode(row.wrapped_cek).decode("utf-8"),
                wrapped_cek_iv=base64.b64encode(row.wrapped_cek_iv).decode("utf-8"),
                payload_ciphertext=base64.b64encode(row.encrypted_item).decode("utf-8"),
                payload_iv=base64.b64encode(row.payload_iv).decode("utf-8"),
                aad=row.aad,
                algorithm=row.algorithm,
                version=row.version,
                permission=row.permission,
                shared_at=row.shared_at,
            )
        )

    return SharedInboxResponse(items=items)


async def notify_recipient_of_revocation(db: Session, audit_entry: ShareRevocationAudit) -> None:
    audit_entry.notified_at = datetime.now(timezone.utc)
    db.commit()


@router.delete(
    "/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
        404: {"model": ErrorResponse, "description": "Share record not found"},
    },
)
async def revoke_share(
    share_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(SharedItem).filter(SharedItem.id == share_id).first()

    if not row or (row.from_user_id != current_user.id and row.to_user_id != current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "share_not_found", "message": "Share record not found"},
        )

    if row.revoked_at is not None:
        return

    revoked_at = datetime.now(timezone.utc)
    row.revoked_at = revoked_at

    audit_entry = ShareRevocationAudit(
        id=uuid.uuid4(),
        share_id=row.id,
        revoked_by_user_id=current_user.id,
        recipient_user_id=row.to_user_id,
        revoked_at=revoked_at,
    )
    db.add(audit_entry)
    db.commit()

    await notify_recipient_of_revocation(db, audit_entry)