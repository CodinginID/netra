-- Postgres init script (runs ONCE on a fresh data volume via
-- /docker-entrypoint-initdb.d). Belt-and-suspenders only — the Alembic
-- migration b69335609137 is the source of truth for the netra_app role.
--
-- Creates the least-privilege application login role so a freshly-created
-- local volume already has it even before migrations run. Idempotent.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'netra_app') THEN
        CREATE ROLE netra_app LOGIN PASSWORD 'netra_app'
            NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO netra_app;
