#!/bin/sh
# Container entrypoint. On start:
#   1. apply DB migrations (unless AUTO_MIGRATE=false)
#   2. optionally ensure a platform super admin exists (if SUPERADMIN_* set)
#   3. hand off to the given command (uvicorn by default)
set -e

# 1. Migrations — idempotent (no-op when already at head). Uses DATABASE_ADMIN_URL
#    (owner) because early migrations CREATE EXTENSION / CREATE ROLE need it.
#    Fatal on failure: don't serve on a broken/empty schema.
if [ "${AUTO_MIGRATE:-true}" != "false" ]; then
  echo "[entrypoint] running migrations (alembic upgrade head)"
  alembic upgrade head
fi

# 2. Super admin — idempotent (seeder skips if the email exists) and non-fatal.
if [ -n "$SUPERADMIN_EMAIL" ] && [ -n "$SUPERADMIN_PASSWORD" ]; then
  echo "[entrypoint] ensuring super admin: $SUPERADMIN_EMAIL"
  python -m scripts.seed_superadmin \
    --email "$SUPERADMIN_EMAIL" \
    --password "$SUPERADMIN_PASSWORD" \
    --full-name "${SUPERADMIN_NAME:-Platform Owner}" \
    || echo "[entrypoint] super admin seed skipped/failed (continuing)"
fi

exec "$@"
