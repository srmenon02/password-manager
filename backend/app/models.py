from sqlalchemy import Column, String, LargeBinary, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    salt = Column(LargeBinary, nullable=False)
    auth_verifier = Column(Text, nullable=False)  # SRP verifier
    public_key = Column(Text, nullable=True)  # For secure sharing feature
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    vault = relationship("Vault", back_populates="user", uselist=False, cascade="all, delete-orphan")
    shared_items_sent = relationship("SharedItem", foreign_keys="SharedItem.from_user_id", back_populates="from_user")
    shared_items_received = relationship("SharedItem", foreign_keys="SharedItem.to_user_id", back_populates="to_user")


class Vault(Base):
    __tablename__ = "vaults"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    protected_key = Column(LargeBinary, nullable=False)  # Encrypted vault_encryption_key
    protected_key_iv = Column(LargeBinary, nullable=False)  # IV for protected_key
    encrypted_blob = Column(LargeBinary, nullable=False)  # Encrypted vault data
    vault_iv = Column(LargeBinary, nullable=False)  # IV for encrypted_blob
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="vault")


class SharedItem(Base):
    __tablename__ = "shared_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    to_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    encrypted_item = Column(LargeBinary, nullable=False)  # Item encrypted with recipient's public key
    shared_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    from_user = relationship("User", foreign_keys=[from_user_id], back_populates="shared_items_sent")
    to_user = relationship("User", foreign_keys=[to_user_id], back_populates="shared_items_received")
