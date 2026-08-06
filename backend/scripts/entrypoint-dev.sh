#!/bin/sh
# ── Development entrypoint ─────────────────────────────────────────────────
# Runs Alembic migrations, then starts uvicorn with --reload so any source
# change on the host is reflected live in the container.
#
# Usage:
#   docker compose up --build
#
# Auto-reload is enabled via --reload flag in uvicorn.
# ────────────────────────────────────────────────────────────────────────────

set -e

# Activate the venv so alembic/uvicorn are in PATH
. .venv/bin/activate 2>/dev/null || true

# 1. Run migrations (idempotent — no-op if already at head).
echo "[entrypoint] running migrations (alembic upgrade head)"
python -m alembic upgrade head

# 2. Ensure super admin exists (idempotent).
echo "[entrypoint] ensuring super admin: $SUPERADMIN_EMAIL"
python -m scripts.seed_superadmin \
  --email "$SUPERADMIN_EMAIL" \
  --password "$SUPERADMIN_PASSWORD" \
  --full-name "${SUPERADMIN_NAME:-Platform Owner}" \
  || echo "[entrypoint] super admin seed skipped/failed (continuing)"

# 3. Launch uvicorn with auto-reload enabled.
#    --reload-dir /app watches the bind-mounted source tree.
echo "[entrypoint] starting uvicorn on 0.0.0.0:5170 (auto-reload enabled)"
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 5170 --reload --reload-dir /app
