"""create breach_results and share_revocation_audit

Both tables were previously created only by `ensure_schema_compatibility()` ->
`create_all()` at app boot, which runs after migrations. That left them outside the
migration chain entirely, so the RLS migration skipped them on a fresh database and they
came up without row level security.

Creation is inspector-guarded because existing environments already have these tables
from the boot-time fallback. RLS is re-applied here for the fresh-database case and is
idempotent where it already holds.

Revision ID: f3c8d1e64b92
Revises: e7b41c9d2a86
Create Date: 2026-09-08 13:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "f3c8d1e64b92"
down_revision = "e7b41c9d2a86"
branch_labels = None
depends_on = None

NEW_TABLES = ("breach_results", "share_revocation_audit")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("breach_results"):
        op.create_table(
            "breach_results",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("entry_id", sa.String(), nullable=False),
            sa.Column("breached", sa.Boolean(), nullable=False),
            sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_seen_count", sa.Integer(), nullable=True),
            sa.Column("source", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "entry_id", name="uq_breach_results_user_entry"),
        )
        op.create_index(op.f("ix_breach_results_user_id"), "breach_results", ["user_id"], unique=False)
        op.create_index(op.f("ix_breach_results_entry_id"), "breach_results", ["entry_id"], unique=False)

    if not inspector.has_table("share_revocation_audit"):
        op.create_table(
            "share_revocation_audit",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("share_id", sa.UUID(), nullable=False),
            sa.Column("revoked_by_user_id", sa.UUID(), nullable=False),
            sa.Column("recipient_user_id", sa.UUID(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["share_id"], ["shared_items.id"]),
            sa.ForeignKeyConstraint(["revoked_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if bind.dialect.name == "postgresql":
        for table in NEW_TABLES:
            op.execute(f'ALTER TABLE "public"."{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table("share_revocation_audit")
    op.drop_index(op.f("ix_breach_results_entry_id"), table_name="breach_results")
    op.drop_index(op.f("ix_breach_results_user_id"), table_name="breach_results")
    op.drop_table("breach_results")
