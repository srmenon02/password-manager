"""step30 sharing protocol scaffold

Revision ID: 6b31ab4c4c90
Revises: a991039ba756
Create Date: 2026-08-10 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "6b31ab4c4c90"
down_revision = "a991039ba756"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("sharing_public_key", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("sharing_private_key_encrypted", sa.LargeBinary(), nullable=True))
    op.add_column("users", sa.Column("sharing_private_key_iv", sa.LargeBinary(), nullable=True))
    op.add_column("users", sa.Column("sharing_key_algorithm", sa.String(), nullable=True))

    op.add_column("shared_items", sa.Column("sender_ephemeral_public_key", sa.Text(), nullable=True))
    op.add_column("shared_items", sa.Column("wrapped_cek", sa.LargeBinary(), nullable=True))
    op.add_column("shared_items", sa.Column("wrapped_cek_iv", sa.LargeBinary(), nullable=True))
    op.add_column("shared_items", sa.Column("payload_iv", sa.LargeBinary(), nullable=True))
    op.add_column("shared_items", sa.Column("aad", sa.Text(), nullable=True))
    op.add_column("shared_items", sa.Column("algorithm", sa.String(), nullable=True))
    op.add_column("shared_items", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("shared_items", sa.Column("permission", sa.String(), nullable=False, server_default="read_write"))
    op.add_column("shared_items", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("shared_items", "revoked_at")
    op.drop_column("shared_items", "permission")
    op.drop_column("shared_items", "version")
    op.drop_column("shared_items", "algorithm")
    op.drop_column("shared_items", "aad")
    op.drop_column("shared_items", "payload_iv")
    op.drop_column("shared_items", "wrapped_cek_iv")
    op.drop_column("shared_items", "wrapped_cek")
    op.drop_column("shared_items", "sender_ephemeral_public_key")

    op.drop_column("users", "sharing_key_algorithm")
    op.drop_column("users", "sharing_private_key_iv")
    op.drop_column("users", "sharing_private_key_encrypted")
    op.drop_column("users", "sharing_public_key")
