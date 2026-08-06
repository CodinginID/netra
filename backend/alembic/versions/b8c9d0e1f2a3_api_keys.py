"""api_keys table + RLS

Revision ID: b8c9d0e1f2a3
Revises: c9370f68ea4e
Create Date: 2026-06-28

Tenant-scoped API keys for server-to-server integration (a tenant's own app
pulling attendance data). Protected by the same RLS tenant-isolation policy as
every other tenant table, and granted to the least-privilege app role.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "b8c9d0e1f2a3"
down_revision = "c9370f68ea4e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("prefix", sa.String(length=20), nullable=False),
        sa.Column("key_hash", sa.String(length=255), nullable=False),
        sa.Column("scopes", JSONB(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "revoked", name="api_key_status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_apikey_tenant", "api_keys", ["tenant_id"], unique=False)
    # Fast lookup by hash on the unauthenticated integration path.
    op.create_index("ix_apikey_key_hash", "api_keys", ["key_hash"], unique=True)

    # RLS: strict per-tenant isolation (same policy shape as the core tables).
    op.execute("ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE api_keys FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON api_keys
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

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO netra_app")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON api_keys")
    op.drop_index("ix_apikey_key_hash", table_name="api_keys")
    op.drop_index("ix_apikey_tenant", table_name="api_keys")
    op.drop_table("api_keys")
    op.execute("DROP TYPE IF EXISTS api_key_status")
