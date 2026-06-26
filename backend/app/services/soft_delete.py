"""Soft delete utilities — mark entities as deleted without removing them."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete as sa_delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

log = get_logger("netra.soft_delete")


async def soft_delete(session: AsyncSession, model_cls, entity_id: str) -> None:
    """Set deleted_at on an entity via UPDATE (no entity load needed)."""
    stmt = (
        update(model_cls)
        .where(model_cls.id == entity_id, model_cls.deleted_at.is_(None))
        .values(deleted_at=datetime.now(UTC))
    )
    result = await session.execute(stmt)
    if result.rowcount == 0:
        log.warning("soft_delete_no_rows", model=model_cls.__name__, entity_id=entity_id)


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
