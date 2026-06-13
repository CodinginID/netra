# netra

Multi-tenant SaaS platform for face-recognition-based attendance tracking.

Cameras stream footage to the backend, which identifies enrolled faces in
real-time and records attendance events — all scoped to isolated tenants via
Row-Level Security in PostgreSQL.

## Monorepo layout

```
netra/
├── backend/          # FastAPI service (Python 3.12, uv)
│   ├── app/          # Application source
│   ├── alembic/      # Database migrations
│   ├── tests/        # Pytest test suite
│   ├── Dockerfile    # Multi-stage production image
│   └── pyproject.toml
├── ui/               # Progressive Web App (scaffolding in progress)
├── docker-compose.yml
└── .github/
    └── workflows/
        └── ci.yml    # GitHub Actions CI
```

## Quickstart

### Prerequisites

- Docker & Docker Compose
- [uv](https://docs.astral.sh/uv/) for backend Python deps (`brew install uv`)
- Node 20+ for the frontend

### 1. Clone and set up environment

```bash
git clone <repo-url> netra
cd netra
cp backend/.env.example backend/.env  # edit secrets before first run
```

### 2. Start the database

```bash
docker compose up -d postgres
```

PostgreSQL with pgvector is available on `localhost:5436`.

### 3. Run migrations

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://netra:netra@localhost:5436/netra \
  uv run alembic upgrade head
```

This applies the initial schema and creates the least-privilege `netra_app` role
used by the application.

### 4. Start the backend

```bash
DATABASE_URL=postgresql+asyncpg://netra_app:netra_app@localhost:5436/netra \
  SECRET_KEY=dev_only_change_me_min_32_chars_long_secret \
  uv run uvicorn app.main:app --reload
```

API available at `http://localhost:8000` — interactive docs at `/docs`.

### Full stack (Docker)

```bash
docker compose --profile full up --build
```

Starts both `postgres` and the pre-built `backend` container.

## Backend

See [backend/README.md](backend/README.md) for the full development guide
including testing, linting, type-checking, and migration commands.

## CI

GitHub Actions runs on every push and pull request:

- **Backend**: ruff lint → mypy type-check → alembic migrate → pytest
- **Frontend**: npm ci → build (non-blocking while `ui/` is in progress)

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

Proprietary — all rights reserved.
