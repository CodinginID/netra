"""Shared pytest fixtures."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.security import hash_password
from app.db.session import SessionFactory, _set_tenant, engine
from app.main import app
from app.models import Role, User


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(autouse=True)
async def clean_db() -> AsyncIterator[None]:
    """Truncate all data before each test (platform/empty context for cleanup).

    Each test runs on its own function-scoped event loop. The module-level
    async engine caches pooled connections bound to whichever loop first used
    them, so we dispose the pool here to force fresh connections on the current
    loop and avoid cross-loop "attached to a different loop" errors.
    """
    from sqlalchemy import text

    await engine.dispose()
    async with engine.begin() as conn:
        await conn.execute(text("SET app.current_tenant = ''"))
        await conn.execute(
            text(
                "TRUNCATE consents, attendance_records, face_embeddings, sso_connections, "
                "schedules, devices, users, tenants, audit_logs RESTART IDENTITY CASCADE"
            )
        )
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def super_admin() -> User:
    async with SessionFactory() as session:
        await _set_tenant(session, None)
        admin = User(
            tenant_id=None,
            username="owner",
            full_name="Platform Owner",
            role=Role.super_admin,
            password_hash=hash_password("ownerpass123"),
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        return admin
