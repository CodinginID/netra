"""Async database engine, session factory, and per-request tenant context.

Row-Level Security (RLS) isolation works by setting the Postgres session
variable ``app.current_tenant`` on each connection. RLS policies on every
tenant-scoped table compare ``tenant_id`` against this variable, so a query
can never leak rows across tenants — even if application code forgets a
WHERE clause.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_pre_ping=True,
    future=True,
)

SessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def _set_tenant(session: AsyncSession, tenant_id: str | None) -> None:
    """Bind the tenant for this DB session so RLS policies apply.

    Uses set_config(..., is_local=true) so the setting is scoped to the
    current transaction only and cannot bleed across pooled connections.
    """
    # NULL/empty => no tenant (platform/superadmin context); RLS policies
    # that require a tenant will then return zero rows for tenant tables.
    await session.execute(
        text("SELECT set_config('app.current_tenant', :tid, true)"),
        {"tid": tenant_id or ""},
    )


@asynccontextmanager
async def get_session(tenant_id: str | None = None) -> AsyncIterator[AsyncSession]:
    """Context-managed session with tenant bound for RLS."""
    async with SessionFactory() as session:
        await _set_tenant(session, tenant_id)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    await engine.dispose()
