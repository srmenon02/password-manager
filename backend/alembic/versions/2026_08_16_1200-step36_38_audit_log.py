"""step36 38 audit log

Revision ID: 8a0d6b7c2f11
Revises: 6b31ab4c4c90
Create Date: 2026-08-16 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "8a0d6b7c2f11"
down_revision = "6b31ab4c4c90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_log_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("previous_hash", sa.String(length=64), nullable=True),
        sa.Column("entry_hash", sa.String(length=64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entry_hash"),
    )
    op.create_index(op.f("ix_audit_log_entries_action"), "audit_log_entries", ["action"], unique=False)
    op.create_index(op.f("ix_audit_log_entries_occurred_at"), "audit_log_entries", ["occurred_at"], unique=False)
    op.create_index(op.f("ix_audit_log_entries_user_id"), "audit_log_entries", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_log_entries_user_id"), table_name="audit_log_entries")
    op.drop_index(op.f("ix_audit_log_entries_occurred_at"), table_name="audit_log_entries")
    op.drop_index(op.f("ix_audit_log_entries_action"), table_name="audit_log_entries")
    op.drop_table("audit_log_entries")