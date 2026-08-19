"""add due_date to invoices

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'invoices',
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
    )

    # Backfill only invoices that were actually issued, using the default net
    # terms. Drafts keep due_date NULL on purpose: a draft has no deadline yet,
    # and giving it an invented one would surface it as a phantom arrear on the
    # billing dashboard.
    op.execute(
        "UPDATE invoices SET due_date = issued_at + INTERVAL '14 days' "
        "WHERE issued_at IS NOT NULL"
    )

    # Supports the dashboard's overdue bucket, which filters on status and
    # compares due_date against now().
    op.create_index('ix_invoice_status_due_date', 'invoices', ['status', 'due_date'])


def downgrade() -> None:
    op.drop_index('ix_invoice_status_due_date', table_name='invoices')
    op.drop_column('invoices', 'due_date')
