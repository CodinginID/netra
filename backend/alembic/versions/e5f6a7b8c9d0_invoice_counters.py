"""add invoice_counters table (monthly invoice numbering)

Revision ID: e5f6a7b8c9d0
Revises: c3d4e5f6g7h8
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'c3d4e5f6g7h8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Platform-level counter backing invoice numbers like INV-202608-0001.
    # One row per YYYYMM period, bumped with INSERT ... ON CONFLICT DO UPDATE
    # ... RETURNING so a monthly billing run issuing many invoices at once
    # cannot hand two of them the same number.
    #
    # No tenant_id and no RLS: the sequence is platform-wide, and it is only
    # ever touched through the super-admin-gated invoice endpoints.
    op.create_table(
        'invoice_counters',
        sa.Column('period', sa.String(6), primary_key=True),  # YYYYMM
        sa.Column('next_value', sa.Integer, nullable=False, server_default='0'),
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_counters TO netra_app")


def downgrade() -> None:
    op.drop_table('invoice_counters')
