"""api_keys.allowed_origins

Revision ID: d3e4f5a6b7c8
Revises: c9d0e1f2a3b4
Create Date: 2026-07-09

Per-key embed origin allowlist (like an OAuth client's redirect URIs): each
API key now carries its own ``allowed_origins`` instead of relying on a
single tenant-wide list, so a tenant with several keys (dev/staging/prod)
can scope origins per key without touching the others.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "d3e4f5a6b7c8"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_keys",
        sa.Column("allowed_origins", JSONB(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("api_keys", "allowed_origins")
