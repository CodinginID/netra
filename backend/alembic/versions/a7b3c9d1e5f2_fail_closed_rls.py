"""fail-closed RLS: an unbound tenant must match zero rows, not every row

The original ``tenant_isolation`` policies (8878cdbf1075) treated an empty
``app.current_tenant`` as "platform context — full access":

    USING (
        current_setting('app.current_tenant', true) IS NULL
        OR current_setting('app.current_tenant', true) = ''      -- fail OPEN
        OR tenant_id = current_setting('app.current_tenant', true)
    )

That makes tenant isolation depend on every caller remembering to bind a
tenant. Any request that reaches the DB without one — a super admin whose
``X-Tenant-Id`` header is missing, stale, or lost to a frontend race — silently
receives every tenant's rows merged together instead of an error or an empty
result. Observed in production as cross-tenant data appearing in tenant-scoped
menus.

This migration inverts the default. A bound tenant sees exactly its own rows;
an unbound session sees nothing. Crossing tenants becomes an explicit,
separately-granted capability via ``app.platform_context = 'on'``, set only by
code paths where that is the intent (login, tenant administration, and token
lookups by hash, where the tenant is unknown until the row is found).

Net effect: forgetting to bind a tenant now under-fetches (empty list) instead
of over-fetching (every tenant), and the fix is fail-safe by construction.

Revision ID: a7b3c9d1e5f2
Revises: d3e4f5a6b7c8
Create Date: 2026-08-04

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b3c9d1e5f2"
down_revision: str | Sequence[str] | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Every table carrying a tenant_id and guarded by a `tenant_isolation` policy.
# Sourced from 8878cdbf1075 (initial), b8c9d0e1f2a3 (api_keys),
# c9d0e1f2a3b4 (embed_sessions) and d4e5f6a7b8c9 (webhook_endpoints).
TENANT_TABLES = (
    "users",
    "face_embeddings",
    "schedules",
    "attendance_records",
    "devices",
    "sso_connections",
    "consents",
    "api_keys",
    "embed_sessions",
    "webhook_endpoints",
)

# Strict predicate: match on tenant, or hold the explicit platform grant.
# current_setting(..., true) returns NULL for a never-set variable, and
# `tenant_id = NULL` is NULL (not true), so an unbound session matches nothing.
_FAIL_CLOSED = """
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.platform_context', true) = 'on'
"""

# The original fail-open predicate, restored on downgrade.
_FAIL_OPEN = """
    current_setting('app.current_tenant', true) IS NULL
    OR current_setting('app.current_tenant', true) = ''
    OR tenant_id = current_setting('app.current_tenant', true)
"""


# audit_logs was never covered by RLS at all, yet carries tenant_id. Reads are
# isolated like any tenant table; writes additionally allow tenant_id IS NULL so
# a tenant-scoped session can still record a platform-level action (e.g. a purge).
_AUDIT_READ = _FAIL_CLOSED
_AUDIT_WRITE = f"{_FAIL_CLOSED} OR tenant_id IS NULL"


def _apply(predicate: str) -> None:
    for table in TENANT_TABLES:
        # RLS/FORCE RLS are already enabled by the creating migrations; re-assert
        # them so a table that somehow lost them is repaired rather than silently
        # left unguarded.
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            USING ({predicate})
            WITH CHECK ({predicate})
            """
        )


def upgrade() -> None:
    """Replace the fail-open policies with fail-closed ones."""
    _apply(_FAIL_CLOSED)

    op.execute("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON audit_logs")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON audit_logs
        USING ({_AUDIT_READ})
        WITH CHECK ({_AUDIT_WRITE})
        """
    )


def downgrade() -> None:
    """Restore the fail-open policies (reintroduces the cross-tenant leak)."""
    _apply(_FAIL_OPEN)

    op.execute("DROP POLICY IF EXISTS tenant_isolation ON audit_logs")
    op.execute("ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY")
