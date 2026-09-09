"""convert naive timestamp columns to timestamptz

`initial_schema` created these columns with `sa.DateTime()` (timestamp without time
zone) while models.py declares them `DateTime(timezone=True)` and writes
`datetime.now(timezone.utc)`. Postgres strips the offset on write and returns naive
datetimes on read, so comparisons against aware datetimes raise TypeError. SQLite stores
every datetime as TEXT, which is why the test suite never surfaced this.

Existing values were written as UTC, so the conversion states that explicitly rather
than relying on the session TimeZone setting.

Revision ID: a92f7d3e15c4
Revises: f3c8d1e64b92
Create Date: 2026-09-08 14:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "a92f7d3e15c4"
down_revision = "f3c8d1e64b92"
branch_labels = None
depends_on = None

COLUMNS = (
    ("users", "created_at"),
    ("users", "updated_at"),
    ("vaults", "created_at"),
    ("vaults", "updated_at"),
    ("shared_items", "shared_at"),
)


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, column in COLUMNS:
        op.alter_column(
            table,
            column,
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, column in COLUMNS:
        op.alter_column(
            table,
            column,
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=False,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
