"""email as global login identifier for staff

Backfills a placeholder email for existing staff accounts (so they aren't locked
out) and adds a GLOBAL unique constraint on users.email. Email becomes the login
identifier for super_admin / tenant_admin / supervisor; end_users keep NULL email
and are identified by (tenant_id, external_id).

Revision ID: a1b2c3d4e5f6
Revises: f2g3h4i5j6k7
Create Date: 2026-06-25
"""

from __future__ import annotations

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "f2g3h4i5j6k7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Backfill: staff without an email get a placeholder derived from their
    # username (editable later via the Users page). Lowercased to match the
    # case-insensitive uniqueness convention. End users are left untouched.
    op.execute(
        """
        UPDATE users
        SET email = lower(username) || '@netra.app'
        WHERE email IS NULL
          AND username IS NOT NULL
          AND role IN ('super_admin', 'tenant_admin', 'supervisor')
        """
    )
    # Global unique on email. Postgres allows multiple NULLs, so end_users with
    # NULL email do not conflict.
    op.create_unique_constraint("uq_user_email", "users", ["email"])


def downgrade() -> None:
    op.drop_constraint("uq_user_email", "users", type_="unique")
    op.execute(
        """
        UPDATE users
        SET email = NULL
        WHERE email LIKE '%@netra.app'
        """
    )
