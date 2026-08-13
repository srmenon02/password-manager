from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import base64

from app.database import get_db
from app.models import BreachResult, User, Vault
from app.schemas import (
    VaultResponse,
    VaultUpdateRequest,
    VaultUpdateResponse,
    ChangePasswordRequest,
    ErrorResponse,
    BreachResultsListResponse,
    BreachResultsSaveRequest,
    BreachResultResponse,
)
from app.auth import get_current_user
from datetime import datetime, timezone

router = APIRouter()


@router.get(
    "",
    response_model=VaultResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
        404: {"model": ErrorResponse, "description": "Vault not found"}
    }
)
async def get_vault(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vault = db.query(Vault).filter(Vault.user_id == current_user.id).first()
    
    if not vault:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "vault_not_found", "message": "No vault found for this user"}
        )
    
    return VaultResponse(
        protected_key=base64.b64encode(vault.protected_key).decode('utf-8'),
        protected_key_iv=base64.b64encode(vault.protected_key_iv).decode('utf-8'),
        encrypted_blob=base64.b64encode(vault.encrypted_blob).decode('utf-8'),
        vault_iv=base64.b64encode(vault.vault_iv).decode('utf-8'),
        updated_at=vault.updated_at
    )


@router.put(
    "",
    response_model=VaultUpdateResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
        400: {"model": ErrorResponse, "description": "Invalid request"}
    }
)
async def update_vault(
    request: VaultUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vault = db.query(Vault).filter(Vault.user_id == current_user.id).first()
    
    if not vault:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "vault_not_found", "message": "No vault found for this user"}
        )
    
    # Decode base64 fields
    try:
        encrypted_blob_bytes = base64.b64decode(request.encrypted_blob)
        vault_iv_bytes = base64.b64decode(request.vault_iv)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_encoding", "message": f"Invalid base64 encoding: {str(e)}"}
        )
    
    if len(vault_iv_bytes) != 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_iv", "message": "Vault IV must be 12 bytes"}
        )
    
    try:
        vault.encrypted_blob = encrypted_blob_bytes
        vault.vault_iv = vault_iv_bytes
        db.commit()
        db.refresh(vault)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "database_error", "message": f"Failed to update vault: {str(e)}"}
        )
    
    return VaultUpdateResponse(updated_at=vault.updated_at)


@router.post(
    "/breaches",
    response_model=BreachResultsListResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
        400: {"model": ErrorResponse, "description": "Invalid request"}
    }
)
async def save_breach_results(
    request: BreachResultsSaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    results: list[BreachResultResponse] = []

    for result in request.results:
        normalized_sha1 = result.password_sha1.upper()
        row = db.query(BreachResult).filter(
            BreachResult.user_id == current_user.id,
            BreachResult.entry_id == result.entry_id,
        ).first()

        if row is None:
            row = BreachResult(
                user_id=current_user.id,
                entry_id=result.entry_id,
                password_sha1=normalized_sha1,
            )
            db.add(row)

        row.password_sha1 = normalized_sha1
        row.breached = bool(result.breached)
        row.last_seen_count = result.last_seen_count
        row.checked_at = datetime.now(timezone.utc)
        row.source = "hibp"
        db.flush()

        results.append(
            BreachResultResponse(
                entry_id=row.entry_id,
                breached=row.breached,
                checked_at=row.checked_at,
                last_seen_count=row.last_seen_count,
            )
        )

    db.commit()
    return BreachResultsListResponse(results=results)


@router.get(
    "/breaches",
    response_model=BreachResultsListResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
    }
)
async def list_breach_results(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    rows = db.query(BreachResult).filter(BreachResult.user_id == current_user.id).all()
    results = [
        BreachResultResponse(
            entry_id=row.entry_id,
            breached=row.breached,
            checked_at=row.checked_at,
            last_seen_count=row.last_seen_count,
        )
        for row in rows
    ]
    return BreachResultsListResponse(results=results)


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid current password proof"},
        400: {"model": ErrorResponse, "description": "Invalid request"}
    }
)
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vault = db.query(Vault).filter(Vault.user_id == current_user.id).first()
    
    if not vault:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "vault_not_found", "message": "No vault found for this user"}
        )
    
    try:
        proof_bytes = base64.b64decode(request.current_password_proof)
        if len(proof_bytes) != 32:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_proof", "message": "Invalid proof length"}
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_encoding", "message": "Invalid current password"}
        )
    try:
        new_salt_bytes = base64.b64decode(request.new_salt)
        new_protected_key_bytes = base64.b64decode(request.new_protected_key)
        new_protected_key_iv_bytes = base64.b64decode(request.new_protected_key_iv)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_encoding", "message": f"Invalid base64 encoding: {str(e)}"}
        )
    
    if len(new_salt_bytes) != 16:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_salt", "message": "Salt must be 16 bytes"}
        )
    if len(new_protected_key_bytes) != 48:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_protected_key", "message": "Protected key must be 48 bytes"}
        )
    if len(new_protected_key_iv_bytes) != 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_iv", "message": "Protected key IV must be 12 bytes"}
        )
    
    try:
        current_user.salt = new_salt_bytes
        current_user.auth_verifier = request.new_auth_verifier
        
        vault.protected_key = new_protected_key_bytes
        vault.protected_key_iv = new_protected_key_iv_bytes
                
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "database_error", "message": f"Failed to change password: {str(e)}"}
        )
    
    return {"message": "Password changed successfully"}
