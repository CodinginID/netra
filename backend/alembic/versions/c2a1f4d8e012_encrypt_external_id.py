"""encrypt external_id at rest + deterministic hash for uniqueness (OPS-5)

external_id (NIS/NIM/NIK) is sensitive PII. It is now encrypted at rest via the
EncryptedStr TypeDecorator (Fernet). Because Fernet ciphertext is
non-deterministic, the (tenant_id, external_id) uniqueness constraint is moved
to a deterministic SHA-256 hash column (external_id_hash).

This migration assumes no pre-existing plaintext external_id rows need
re-encryption (Phase 1 / fresh DB). If data existed it would need a one-off
backfill; documented here for the reviewer.

Revision ID: c2a1f4d8e012
Revises: b69335609137
Create Date: 2026-06-13

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2a1f4d8e012"
down_revision: str | Sequence[str] | None = "b69335609137"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Drop the old uniqueness on the (soon-to-be encrypted) external_id.
    op.drop_constraint("uq_user_tenant_external", "users", type_="unique")
    # Widen external_id to TEXT to hold Fernet ciphertext.
    op.alter_column(
        "users",
        "external_id",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=True,
    )
    # Deterministic hash column for per-tenant uniqueness.
    op.add_column("users", sa.Column("external_id_hash", sa.String(length=64), nullable=True))
    op.create_unique_constraint(
        "uq_user_tenant_external", "users", ["tenant_id", "external_id_hash"]
    )
    # netra_app must be able to read/write the new column. ALL TABLES grant from
    # b69335609137 already covers it (column-level inherits table grant), so no
    # extra GRANT is needed.


def downgrade() -> None:
    op.drop_constraint("uq_user_tenant_external", "users", type_="unique")
    op.drop_column("users", "external_id_hash")
    op.alter_column(
        "users",
        "external_id",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=True,
    )
    op.create_unique_constraint(
        "uq_user_tenant_external", "users", ["tenant_id", "external_id"]
    )
