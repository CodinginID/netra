"""embed_sessions table + RLS

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-01

One-time, short-lived sessions for embedding netra flows (enrollment) inside a
tenant's own app. Tenant-scoped, RLS-isolated, granted to the app role.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "embed_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "purpose",
            sa.Enum("enroll", name="embed_purpose"),
            nullable=False,
            server_default="enroll",
        ),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("is_minor", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("return_origin", sa.String(length=1024), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "consumed", name="embed_session_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_embed_tenant", "embed_sessions", ["tenant_id"], unique=False)
    op.create_index("ix_embed_token_hash", "embed_sessions", ["token_hash"], unique=True)

    op.execute("ALTER TABLE embed_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE embed_sessions FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON embed_sessions
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
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON embed_sessions TO netra_app")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON embed_sessions")
    op.drop_index("ix_embed_token_hash", table_name="embed_sessions")
    op.drop_index("ix_embed_tenant", table_name="embed_sessions")
    op.drop_table("embed_sessions")
    op.execute("DROP TYPE IF EXISTS embed_session_status")
    op.execute("DROP TYPE IF EXISTS embed_purpose")
