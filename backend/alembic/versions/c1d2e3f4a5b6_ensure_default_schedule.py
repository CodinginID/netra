"""give every tenant that has schedules a live default schedule

Scans are judged only against the default schedule; a tenant whose schedules
were all created without "default" had every punch recorded as on_time. The
API now keeps a default in place; this promotes the newest live schedule for
tenants that have none. Punches already stored keep their status — recompute
them with ``scripts/recompute_attendance_status.py``.

Revision ID: c1d2e3f4a5b6
Revises: b8d9e0f1a2b3
Create Date: 2026-10-06
"""
from alembic import op

revision = 'c1d2e3f4a5b6'
down_revision = 'b8d9e0f1a2b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # schedules has FORCE ROW LEVEL SECURITY; this cross-tenant fix needs the platform grant.
    op.execute("SELECT set_config('app.platform_context', 'on', true)")
    op.execute(
        """
        UPDATE schedules SET is_default = true
        WHERE id IN (
            SELECT DISTINCT ON (tenant_id) id FROM schedules
            WHERE deleted_at IS NULL
              AND tenant_id NOT IN (
                  SELECT tenant_id FROM schedules WHERE is_default AND deleted_at IS NULL
              )
            ORDER BY tenant_id, created_at DESC
        )
        """
    )


def downgrade() -> None:
    # Data-only fix: which rows were promoted is not recorded, so nothing to undo.
    pass
