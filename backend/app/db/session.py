"""Async database engine, session factory, and per-request tenant context.

Row-Level Security (RLS) isolation works by setting the Postgres session
variable ``app.current_tenant`` on each connection. RLS policies on every
tenant-scoped table compare ``tenant_id`` against this variable, so a query
can never leak rows across tenants — even if application code forgets a
WHERE clause.

The policies are fail-closed: no tenant bound means no rows. Deliberate
cross-tenant access is a separate, explicit grant (``app.platform_context``)
so that a missing tenant can only ever under-fetch, never over-fetch.
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


async def _set_tenant(
    session: AsyncSession, tenant_id: str | None, *, platform: bool = False
) -> None:
    """Bind the tenant for this DB session so RLS policies apply.

    Uses set_config(..., is_local=true) so the setting is scoped to the
    current transaction only and cannot bleed across pooled connections.

    RLS is **fail-closed**: an empty ``app.current_tenant`` matches no rows on
    tenant-scoped tables. Cross-tenant access therefore requires an explicit
    opt-in via ``platform=True``, which sets ``app.platform_context = 'on'``.
    Pass it only where crossing tenants is the actual intent (login, tenant
    administration, token lookups by hash) — never as a fallback for "no tenant
    was resolved", which is the bug this design exists to prevent.

    Both variables are always written, so a connection returned to the pool can
    never leave a stale platform grant behind.

    INVARIANT: because the settings are transaction local, committing drops
    them. Callers must not commit and then keep querying the same session — the
    follow-up query would run with no tenant bound and (correctly, but
    surprisingly) see nothing. Let the request-scoped dependency own the commit,
    and use ``flush()`` when you need server-generated values mid-request.
    """
    await session.execute(
        text(
            "SELECT set_config('app.current_tenant', :tid, true), "
            "set_config('app.platform_context', :platform, true)"
        ),
        {"tid": tenant_id or "", "platform": "on" if platform else "off"},
    )


@asynccontextmanager
async def get_session(
    tenant_id: str | None = None, *, platform: bool = False
) -> AsyncIterator[AsyncSession]:
    """Context-managed session with tenant bound for RLS."""
    async with SessionFactory() as session:
        await _set_tenant(session, tenant_id, platform=platform)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    await engine.dispose()
