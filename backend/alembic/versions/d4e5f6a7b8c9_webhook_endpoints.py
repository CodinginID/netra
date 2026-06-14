"""webhook_endpoints table + RLS

Revision ID: d4e5f6a7b8c9
Revises: c2a1f4d8e012
Create Date: 2026-06-13

Tenant-scoped subscriber table for attendance webhooks. Protected by the same
RLS tenant-isolation policy as every other tenant table, and explicitly granted
to the least-privilege app role (netra_app).
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c2a1f4d8e012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("url", sa.String(length=1024), nullable=False),
        sa.Column("secret", sa.String(length=255), nullable=False),
        sa.Column("events", JSONB(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_webhook_tenant", "webhook_endpoints", ["tenant_id"], unique=False)

    # RLS: strict per-tenant isolation (same policy shape as the core tables).
    op.execute("ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON webhook_endpoints
        USING (
            current_setting('app.current_tenant', true) IS NULL
            OR current_setting('app.current_tenant', true) = ''
            OR tenant_id = current_setting('app.current_tenant', true)
        )
        WITH CHECK (
            current_setting('app.current_tenant', true) IS NULL
            OR current_setting('app.current_tenant', true) = ''
            OR tenant_id = current_setting('app.current_tenant', true)
        )
        """
    )

    # Grant to the least-privilege app role (idempotent if default privileges
    # already covered it).
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_endpoints TO netra_app"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON webhook_endpoints")
    op.drop_index("ix_webhook_tenant", table_name="webhook_endpoints")
    op.drop_table("webhook_endpoints")
