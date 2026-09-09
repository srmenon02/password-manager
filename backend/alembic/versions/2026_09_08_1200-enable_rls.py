"""enable row level security on all public tables

Supabase exposes the `public` schema through PostgREST, so without RLS every table is
readable and writable by anyone holding the project's anon key. No policies are added:
the API connects as the table owner, which bypasses RLS, so zero policies means
PostgREST gets no access at all while the backend is unaffected.

Tables are filtered through the inspector because `breach_results` and
`share_revocation_audit` are created by `ensure_schema_compatibility()` at app boot
rather than by any migration, so they are absent when this runs on a fresh database.

Revision ID: e7b41c9d2a86
Revises: c4f2e9a17b03
Create Date: 2026-09-08 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "e7b41c9d2a86"
down_revision = "c4f2e9a17b03"
branch_labels = None
depends_on = None

TABLES = (
    "alembic_version",
    "users",
    "vaults",
    "shared_items",
    "audit_log_entries",
    "breach_results",
    "share_revocation_audit",
)


def _existing(bind):
    inspector = sa.inspect(bind)
    return [t for t in TABLES if inspector.has_table(t)]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in _existing(bind):
        op.execute(f'ALTER TABLE "public"."{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in _existing(bind):
        op.execute(f'ALTER TABLE "public"."{table}" DISABLE ROW LEVEL SECURITY')
