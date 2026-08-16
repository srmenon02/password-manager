import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLogEntry


def normalize_audit_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def normalize_audit_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if metadata is None:
        return {}
    return metadata


def serialize_audit_metadata(metadata: dict[str, Any] | None) -> str:
    return json.dumps(normalize_audit_metadata(metadata), sort_keys=True, separators=(",", ":"))


def compute_audit_hash(
    user_id: str,
    action: str,
    occurred_at: datetime,
    previous_hash: str | None,
    metadata_json: str,
) -> str:
    payload = "|".join(
        [
            user_id,
            action,
            normalize_audit_timestamp(occurred_at).isoformat(),
            previous_hash or "",
            metadata_json,
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def append_audit_event(
    db: Session,
    *,
    user_id: str,
    action: str,
    metadata: dict[str, Any] | None = None,
    occurred_at: datetime | None = None,
) -> AuditLogEntry:
    timestamp = occurred_at or datetime.now(timezone.utc)
    previous_entry = (
        db.query(AuditLogEntry)
        .filter(AuditLogEntry.user_id == user_id)
        .order_by(AuditLogEntry.occurred_at.desc(), AuditLogEntry.id.desc())
        .first()
    )
    previous_hash = previous_entry.entry_hash if previous_entry else None
    metadata_json = serialize_audit_metadata(metadata)
    entry = AuditLogEntry(
        id=uuid.uuid4(),
        user_id=user_id,
        action=action,
        metadata_json=metadata_json,
        previous_hash=previous_hash,
        entry_hash=compute_audit_hash(user_id, action, timestamp, previous_hash, metadata_json),
        occurred_at=timestamp,
    )
    db.add(entry)
    db.flush()
    return entry


def verify_audit_chain(entries: list[AuditLogEntry]) -> dict[str, Any]:
    previous_hash = None

    for entry in entries:
        expected_hash = compute_audit_hash(
            str(entry.user_id),
            entry.action,
            entry.occurred_at,
            previous_hash,
            entry.metadata_json,
        )
        if entry.previous_hash != previous_hash:
            return {
                "is_valid": False,
                "checked_entries": len(entries),
                "broken_entry_id": str(entry.id),
                "expected_previous_hash": previous_hash,
                "actual_previous_hash": entry.previous_hash,
                "expected_hash": expected_hash,
                "actual_hash": entry.entry_hash,
            }
        if entry.entry_hash != expected_hash:
            return {
                "is_valid": False,
                "checked_entries": len(entries),
                "broken_entry_id": str(entry.id),
                "expected_previous_hash": previous_hash,
                "actual_previous_hash": entry.previous_hash,
                "expected_hash": expected_hash,
                "actual_hash": entry.entry_hash,
            }
        previous_hash = entry.entry_hash

    return {
        "is_valid": True,
        "checked_entries": len(entries),
        "broken_entry_id": None,
        "expected_previous_hash": None,
        "actual_previous_hash": None,
        "expected_hash": None,
        "actual_hash": None,
        "latest_hash": previous_hash,
    }