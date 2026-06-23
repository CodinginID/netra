# netra — backend

FastAPI backend for the netra multi-tenant face-recognition attendance platform.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.12 |
| Framework | FastAPI 0.115+ |
| ORM | SQLAlchemy 2.0 (async) |
| Driver | asyncpg |
| Vector store | pgvector (PostgreSQL extension) |
| Migrations | Alembic |
| Auth | Argon2 passwords, JWT access tokens (python-jose) |
| Logging | structlog |
| Package manager | uv |

## Database roles

Two PostgreSQL roles are used to enforce least-privilege access:

| Role | Privileges | Used by |
|------|-----------|---------|
| `netra` | Superuser (owns DB, runs migrations) | Alembic, docker-compose dev |
| `netra_app` | SELECT/INSERT/UPDATE/DELETE on app tables only; RLS enforced | Application, pytest |

The `netra_app` role (password `netra_app`) is created automatically by the initial
Alembic migration.  Never use the superuser role in application code.

## Local development

### Prerequisites

- Docker & Docker Compose
- [uv](https://docs.astral.sh/uv/) (`brew install uv` or `pip install uv`)

### 1. Start the database

```bash
# from repo root
docker compose up -d postgres
```

This starts PostgreSQL on `localhost:5436` (container port 5432).

### 2. Install dependencies

```bash
cd backend
uv sync          # creates .venv, installs all deps including dev group
```

### 3. Copy and edit the env file

```bash
cp .env.example .env   # edit DATABASE_URL / SECRET_KEY as needed
```

Default dev values for `DATABASE_URL`:

```
# superuser — migrations only
DATABASE_URL=postgresql+asyncpg://netra:netra@localhost:5436/netra

# app role — application & tests
DATABASE_URL=postgresql+asyncpg://netra_app:netra_app@localhost:5436/netra
```

### 4. Run migrations

Always run with the superuser URL so the migration can create `netra_app`:

```bash
DATABASE_URL=postgresql+asyncpg://netra:netra@localhost:5436/netra \
  uv run alembic upgrade head
```

### 5. Start the server

```bash
DATABASE_URL=postgresql+asyncpg://netra_app:netra_app@localhost:5436/netra \
  SECRET_KEY=dev_only_change_me_min_32_chars_long_secret \
  uv run uvicorn app.main:app --reload --reload-dir app
```

The API is available at `http://localhost:8000`.  Interactive docs at `/docs`.

### Full stack via Docker Compose

```bash
# from repo root
docker compose --profile full up --build
```

This starts both `postgres` and the `backend` container.

## Running tests

```bash
cd backend

# Ensure the DB is running and migrations are applied (see above), then:
DATABASE_URL=postgresql+asyncpg://netra_app:netra_app@localhost:5436/netra \
  SECRET_KEY=test_secret_key_32_chars_long_xxx \
  uv run pytest
```

Run with coverage:

```bash
uv run pytest --cov=app --cov-report=term-missing
```

## Linting & type-checking

```bash
uv run ruff check .        # lint
uv run ruff check . --fix  # auto-fix
uv run mypy app            # type-check
```

## Migrations

Create a new revision:

```bash
DATABASE_URL=postgresql+asyncpg://netra:netra@localhost:5436/netra \
  uv run alembic revision --autogenerate -m "description"
```

Apply migrations:

```bash
DATABASE_URL=postgresql+asyncpg://netra:netra@localhost:5436/netra \
  uv run alembic upgrade head
```

Roll back one step:

```bash
DATABASE_URL=postgresql+asyncpg://netra:netra@localhost:5436/netra \
  uv run alembic downgrade -1
```
