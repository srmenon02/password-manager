"""drop breach_results.password_sha1

Storing the full unsalted SHA-1 of a stored password let the server reconstruct vault
secrets by brute force, breaking the zero-knowledge guarantee. Breach matching now runs
entirely client-side against the HIBP range API (k-anonymous, prefix only) and the server
persists only the resulting verdict.

Guarded with an inspector because `breach_results` is created by
`ensure_schema_compatibility()` / `Base.metadata.create_all()` rather than by any
migration, so the table is absent on a database built from migrations alone.

Revision ID: c4f2e9a17b03
Revises: 8a0d6b7c2f11
Create Date: 2026-09-06 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "c4f2e9a17b03"
down_revision = "8a0d6b7c2f11"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_breach_results_password_sha1"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("breach_results"):
        return

    columns = {column["name"] for column in inspector.get_columns("breach_results")}
    if "password_sha1" not in columns:
        return

    indexes = {index["name"] for index in inspector.get_indexes("breach_results")}

    # batch_alter_table so this also works on SQLite, which the test suite runs against.
    with op.batch_alter_table("breach_results") as batch_op:
        if INDEX_NAME in indexes:
            batch_op.drop_index(INDEX_NAME)
        batch_op.drop_column("password_sha1")


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("breach_results"):
        return

    columns = {column["name"] for column in inspector.get_columns("breach_results")}
    if "password_sha1" in columns:
        return

    # Re-created as nullable: the hashes are intentionally destroyed and cannot be
    # reconstructed, so the original NOT NULL constraint cannot be restored.
    with op.batch_alter_table("breach_results") as batch_op:
        batch_op.add_column(sa.Column("password_sha1", sa.String(length=40), nullable=True))
        batch_op.create_index(INDEX_NAME, ["password_sha1"])
