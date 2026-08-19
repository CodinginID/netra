"""drop plan edition and neutralise the billing cycle vocabulary

Plans carried an ``edition`` of 'education' or 'business'. It drove nothing —
no pricing, no feature gate, no query filtered on it — but it forced every
tenant into one of two verticals, so a clinic or a co-op had to pick a label
that was wrong for them. The same applies to the 'semester' billing cycle,
which is school-calendar vocabulary for what is simply a six-month term.

Revision ID: a7c8d9e0f1a2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-16
"""
from alembic import op

revision = 'a7c8d9e0f1a2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('plans', 'edition')
    op.execute("DROP TYPE IF EXISTS plan_edition")

    # RENAME VALUE rewrites the label in place, so existing rows keep pointing
    # at the same enum member and need no data migration.
    op.execute("ALTER TYPE billing_cycle RENAME VALUE 'semester' TO 'semiannual'")


def downgrade() -> None:
    op.execute("ALTER TYPE billing_cycle RENAME VALUE 'semiannual' TO 'semester'")

    op.execute("CREATE TYPE plan_edition AS ENUM ('education', 'business')")
    # Restores the column and the old default; which edition a plan *was* is
    # not recoverable, so every plan comes back as 'business' — the value the
    # column defaulted to before it was dropped.
    op.execute(
        "ALTER TABLE plans ADD COLUMN edition plan_edition NOT NULL DEFAULT 'business'"
    )
