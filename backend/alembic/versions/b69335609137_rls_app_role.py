"""rls app role (non-superuser, NOBYPASSRLS) for hard tenant isolation

The role `netra` used to own the schema is a Postgres SUPERUSER, and superusers
bypass Row-Level Security even when policies use FORCE ROW LEVEL SECURITY. That
means RLS tenant isolation was effectively a no-op for the application.

This migration creates a dedicated least-privilege login role `netra_app`
(NOSUPERUSER NOBYPASSRLS) that the application connects as. RLS policies are
then actually enforced for every application query.

The migration itself runs as the schema owner / superuser (see alembic/env.py,
which uses an admin URL), so it is able to CREATE ROLE and ALTER DEFAULT
PRIVILEGES even when the app's DATABASE_URL points at netra_app.

Revision ID: b69335609137
Revises: 8878cdbf1075
Create Date: 2026-06-13

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b69335609137"
down_revision: str | Sequence[str] | None = "8878cdbf1075"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "netra_app"
APP_PASSWORD = "netra_app"  # dev-only; production injects a real secret out-of-band.


def upgrade() -> None:
    """Create the least-privilege application role and grant it CRUD access."""
    # Idempotently create the role (covers fresh CI and re-runs).
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} LOGIN PASSWORD '{APP_PASSWORD}'
                    NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
            END IF;
        END
        $$;
        """
    )
    # Belt-and-suspenders: enforce the security-critical attributes even if the
    # role already existed with different flags.
    op.execute(f"ALTER ROLE {APP_ROLE} NOSUPERUSER NOBYPASSRLS")

    # Schema + object privileges (data access only; no DDL).
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    # TRUNCATE is included so dev/CI test fixtures can reset tables as the app
    # role; it is a privilege grant (not RLS bypass) and still requires the role
    # to be NOBYPASSRLS for row reads/writes.
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE "
        f"ON ALL TABLES IN SCHEMA public TO {APP_ROLE}"
    )
    op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}")

    # Future tables/sequences created by the migration owner are auto-granted.
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO {APP_ROLE}"
    )
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT USAGE, SELECT ON SEQUENCES TO {APP_ROLE}"
    )


def downgrade() -> None:
    """Revoke privileges and drop the application role."""
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM {APP_ROLE}"
    )
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"REVOKE USAGE, SELECT ON SEQUENCES FROM {APP_ROLE}"
    )
    op.execute(f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {APP_ROLE}")
    op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {APP_ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE}")
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                DROP ROLE {APP_ROLE};
            END IF;
        END
        $$;
        """
    )
