import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.audit import verify_audit_chain
from app.auth import get_current_user
from app.database import get_db
from app.models import AuditLogEntry, User
from app.schemas import AuditLogEntryResponse, AuditLogListResponse, AuditLogVerifyResponse, ErrorResponse

router = APIRouter()


@router.get(
    "",
    response_model=AuditLogListResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
    },
)
async def list_audit_log(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AuditLogEntry)
        .filter(AuditLogEntry.user_id == current_user.id)
        .order_by(AuditLogEntry.occurred_at.desc(), AuditLogEntry.id.desc())
        .all()
    )
    return AuditLogListResponse(
        entries=[
            AuditLogEntryResponse(
                id=str(row.id),
                action=row.action,
                metadata=json.loads(row.metadata_json),
                previous_hash=row.previous_hash,
                entry_hash=row.entry_hash,
                occurred_at=row.occurred_at,
            )
            for row in rows
        ]
    )


@router.get(
    "/verify",
    response_model=AuditLogVerifyResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid token"},
    },
)
async def verify_current_user_audit_log(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AuditLogEntry)
        .filter(AuditLogEntry.user_id == current_user.id)
        .order_by(AuditLogEntry.occurred_at.asc(), AuditLogEntry.id.asc())
        .all()
    )
    return AuditLogVerifyResponse(**verify_audit_chain(rows))