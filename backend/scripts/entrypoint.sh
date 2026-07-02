#!/bin/sh
# Container entrypoint: optionally ensure a platform super admin exists, then
# hand off to the given command (uvicorn by default).
#
# Auto-seed runs ONLY when both env vars are set. It's idempotent — the seeder
# skips if the email already exists — and non-fatal (a failure, e.g. migrations
# not yet applied, logs a warning and the app still starts).
set -e

if [ -n "$SUPERADMIN_EMAIL" ] && [ -n "$SUPERADMIN_PASSWORD" ]; then
  echo "[entrypoint] ensuring super admin: $SUPERADMIN_EMAIL"
  python -m scripts.seed_superadmin \
    --email "$SUPERADMIN_EMAIL" \
    --password "$SUPERADMIN_PASSWORD" \
    --full-name "${SUPERADMIN_NAME:-Platform Owner}" \
    || echo "[entrypoint] super admin seed skipped/failed (continuing)"
fi

exec "$@"
