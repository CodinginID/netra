# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 1 — Foundation

#### Added

- **Project structure** — monorepo layout with `backend/` (FastAPI, Python 3.12, uv)
  and `ui/` (PWA frontend, scaffolding in progress).
- **Backend application** (`backend/app/`) — FastAPI entry-point, SQLAlchemy async
  models for `tenants`, `users`, `cameras`, `events`, and `faces`; Pydantic schemas;
  core security utilities (Argon2 password hashing, JWT access tokens); structured
  logging with `structlog`.
- **Database layer** — async PostgreSQL via `asyncpg` + SQLAlchemy 2.0;
  `pgvector` extension for face-embedding storage; Row-Level Security (RLS) enforced
  via a least-privilege `netra_app` role (created by migrations, owned by superuser
  `netra`).
- **Alembic migrations** — initial schema migration (`8878cdbf1075`) creates all
  tables, enables the `vector` extension, and provisions the `netra_app` role with
  appropriate table grants.
- **Docker Compose** — `postgres` service (`pgvector/pgvector:pg16`, port 5436);
  `backend` service under the `full` profile (built from `backend/Dockerfile`).
- **Backend Dockerfile** — multi-stage build: `uv` resolves production deps into an
  isolated venv; runtime stage runs as a non-root user.
- **CI pipeline** (`.github/workflows/ci.yml`) — GitHub Actions workflow running on
  every push / pull request; backend job: ruff lint, mypy type-check, alembic
  migrations (superuser), pytest with coverage; frontend job (non-blocking while `ui/`
  is still scaffolding).
- **Repo tooling** — `.gitignore` covering Python, Node/Vite, `.env` files,
  coverage artifacts, and AI-tooling caches.
