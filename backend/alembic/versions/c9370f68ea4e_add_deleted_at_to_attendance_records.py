"""add_deleted_at_to_attendance_records

Revision ID: c9370f68ea4e
Revises: a1b2c3d4e5f6
Create Date: 2026-06-26 19:28:33.712134

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9370f68ea4e'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add deleted_at column to attendance_records for soft-delete support."""
    op.add_column(
        "attendance_records",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Remove deleted_at column from attendance_records."""
    op.drop_column("attendance_records", "deleted_at")
