"""add soft delete columns

Revision ID: e1f2a3b4c5d6
Revises: d4e5f6a7b8c9
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('schedules', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('devices', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('devices', 'deleted_at')
    op.drop_column('schedules', 'deleted_at')
    op.drop_column('users', 'deleted_at')
    op.drop_column('tenants', 'deleted_at')
