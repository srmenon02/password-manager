from sqlalchemy import Column, String, LargeBinary, DateTime, ForeignKey, Text, Boolean, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator
from datetime import datetime, timezone
import uuid

from app.database import Base


class GUID(TypeDecorator):
    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


class User(Base):
    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    salt = Column(LargeBinary, nullable=False)
    auth_verifier = Column(Text, nullable=False)
    public_key = Column(Text, nullable=True)
    sharing_public_key = Column(Text, nullable=True)
    sharing_private_key_encrypted = Column(LargeBinary, nullable=True)
    sharing_private_key_iv = Column(LargeBinary, nullable=True)
    sharing_key_algorithm = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    vault = relationship("Vault", back_populates="user", uselist=False, cascade="all, delete-orphan")
    shared_items_sent = relationship("SharedItem", foreign_keys="SharedItem.from_user_id", back_populates="from_user")
    shared_items_received = relationship("SharedItem", foreign_keys="SharedItem.to_user_id", back_populates="to_user")
    breach_results = relationship("BreachResult", back_populates="user", cascade="all, delete-orphan")
    audit_log_entries = relationship("AuditLogEntry", back_populates="user", cascade="all, delete-orphan")


class Vault(Base):
    __tablename__ = "vaults"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    protected_key = Column(LargeBinary, nullable=False)
    protected_key_iv = Column(LargeBinary, nullable=False)
    encrypted_blob = Column(LargeBinary, nullable=False)
    vault_iv = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="vault")


class SharedItem(Base):
    __tablename__ = "shared_items"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    from_user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    to_user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    encrypted_item = Column(LargeBinary, nullable=False)
    sender_ephemeral_public_key = Column(Text, nullable=True)
    wrapped_cek = Column(LargeBinary, nullable=True)
    wrapped_cek_iv = Column(LargeBinary, nullable=True)
    payload_iv = Column(LargeBinary, nullable=True)
    aad = Column(Text, nullable=True)
    algorithm = Column(String, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    permission = Column(String, nullable=False, default="read_write")
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    shared_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    from_user = relationship("User", foreign_keys=[from_user_id], back_populates="shared_items_sent")
    to_user = relationship("User", foreign_keys=[to_user_id], back_populates="shared_items_received")


class BreachResult(Base):
    __tablename__ = "breach_results"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_id = Column(String, nullable=False, index=True)
    password_sha1 = Column(String(40), nullable=False, index=True)
    breached = Column(Boolean, nullable=False, default=False)
    checked_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    last_seen_count = Column(Integer, nullable=True)
    source = Column(String, nullable=False, default="hibp")

    user = relationship("User", back_populates="breach_results")

    __table_args__ = (
        UniqueConstraint("user_id", "entry_id", name="uq_breach_results_user_entry"),
    )


class AuditLogEntry(Base):
    __tablename__ = "audit_log_entries"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    previous_hash = Column(String(64), nullable=True)
    entry_hash = Column(String(64), nullable=False, unique=True)
    occurred_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    user = relationship("User", back_populates="audit_log_entries")


class ShareRevocationAudit(Base):
    __tablename__ = "share_revocation_audit"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    share_id = Column(GUID(), ForeignKey("shared_items.id"), nullable=False)
    revoked_by_user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    recipient_user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=False)
    notified_at = Column(DateTime(timezone=True), nullable=True)