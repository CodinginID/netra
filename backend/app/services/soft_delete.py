"""Soft delete utilities — mark entities as deleted without removing them."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete as sa_delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

log = get_logger("netra.soft_delete")


async def soft_delete(session: AsyncSession, model_cls, entity_id: str) -> bool:
    """Set deleted_at on an entity via UPDATE (no entity load needed).

    Returns True if a row was marked deleted, False if none matched — the entity
    does not exist, is already deleted, or is invisible to this session's RLS
    scope. Callers MUST act on False (404); returning success for a delete that
    changed nothing is how a broken delete stays invisible.
    """
    stmt = (
        update(model_cls)
        .where(model_cls.id == entity_id, model_cls.deleted_at.is_(None))
        .values(deleted_at=datetime.now(UTC))
    )
    result = await session.execute(stmt)
    if result.rowcount == 0:
        log.warning("soft_delete_no_rows", model=model_cls.__name__, entity_id=entity_id)
        return False
    return True


async def restore(session: AsyncSession, model_cls, entity_id: str) -> bool:
    """Clear deleted_at. Returns True if restored, False if not found."""
    stmt = (
        update(model_cls)
        .where(model_cls.id == entity_id, model_cls.deleted_at.isnot(None))
        .values(deleted_at=None)
    )
    result = await session.execute(stmt)
    return result.rowcount > 0


async def hard_delete_older_than(
    session: AsyncSession,
    model_cls,
    *,
    days: int = 30,
) -> int:
    """Permanently delete soft-deleted entities older than `days` days."""
    cutoff = datetime.now(UTC) - timedelta(days=days)
    stmt = sa_delete(model_cls).where(
        model_cls.deleted_at.isnot(None),
        model_cls.deleted_at < cutoff,
    )
    result = await session.execute(stmt)
    return result.rowcount


async def purge_expired(days: int = 30) -> dict[str, int]:
    """Hard-delete soft-deleted rows past the retention window, for every tenant.

    Owns its own session because it runs from a background loop with no request
    (and therefore no tenant) behind it.
    """
    from app.db.session import SessionFactory, _set_tenant
    from app.models import Device, Schedule, User

    async with SessionFactory() as session:
        # Platform grant is REQUIRED: under fail-closed RLS an unbound session
        # matches zero rows, so without it this loop purges nothing and reports
        # success. Crossing tenants is the intent here — it is a platform job.
        await _set_tenant(session, None, platform=True)
        counts = {
            "users": await hard_delete_older_than(session, User, days=days),
            "devices": await hard_delete_older_than(session, Device, days=days),
            "schedules": await hard_delete_older_than(session, Schedule, days=days),
        }
        await session.commit()
    return counts
