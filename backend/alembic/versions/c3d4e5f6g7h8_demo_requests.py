"""add demo_requests table

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

revision = 'c3d4e5f6g7h8'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TYPE demo_request_status AS ENUM ('new', 'contacted', 'closed')
    """)

    # Platform-level (no tenant_id — submitted from the public landing page
    # before any tenant exists), same posture as `plans`/`plan_tiers`: no RLS,
    # reachable only via the super-admin-gated list/update endpoints.
    op.create_table(
        'demo_requests',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('organization', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('message', sa.Text, nullable=True),
        sa.Column('status', ENUM('new', 'contacted', 'closed', name='demo_request_status', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_demo_request_status', 'demo_requests', ['status'])

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON demo_requests TO netra_app")


def downgrade() -> None:
    op.drop_table('demo_requests')
    op.execute("DROP TYPE IF EXISTS demo_request_status")
