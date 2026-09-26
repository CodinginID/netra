"""keep an encrypted copy of each device token so admins can view it again

Device tokens were stored only as a SHA-256 hash, so a kiosk that lost its
token had to reset it. ``token_encrypted`` holds a Fernet ciphertext of the
token (same scheme as users.external_id); lookup still uses ``token_hash``.
Existing rows stay NULL — their plaintext is unrecoverable — and become
viewable after one token reset.

Revision ID: b8d9e0f1a2b3
Revises: a7c8d9e0f1a2
Create Date: 2026-09-26
"""
import sqlalchemy as sa

from alembic import op

revision = 'b8d9e0f1a2b3'
down_revision = 'a7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('devices', sa.Column('token_encrypted', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('devices', 'token_encrypted')
