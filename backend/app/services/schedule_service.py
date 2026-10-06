"""Per-tenant attendance schedules (data-driven rules: hours, grace, geofence)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Schedule


async def create_schedule(
    session: AsyncSession,
    tenant_id: str,
    *,
    name: str,
    rules: dict,
    grace_minutes: int = 0,
    geofence: dict | None = None,
    is_default: bool = False,
) -> Schedule:
    # Scans are evaluated only against the default schedule; without one every
    # punch is "on time". So a tenant's first live schedule is always the default.
    if not is_default and await get_default_schedule(session) is None:
        is_default = True
    if is_default:
        # Only one default per tenant — demote any existing default.
        existing = (
            await session.execute(select(Schedule).where(Schedule.is_default.is_(True)))
        ).scalars()
        for s in existing:
            s.is_default = False
    schedule = Schedule(
        tenant_id=tenant_id,
        name=name,
        rules=rules,
        grace_minutes=grace_minutes,
        geofence=geofence,
        is_default=is_default,
    )
    session.add(schedule)
    await session.flush()
    return schedule


async def list_schedules(session: AsyncSession) -> list[Schedule]:
    result = await session.execute(
        select(Schedule).where(Schedule.deleted_at.is_(None)).order_by(Schedule.created_at.desc())
    )
    return list(result.scalars())


async def get_default_schedule(session: AsyncSession) -> Schedule | None:
    return (
        await session.execute(
            select(Schedule)
            .where(Schedule.is_default.is_(True), Schedule.deleted_at.is_(None))
            .limit(1)
        )
    ).scalar_one_or_none()


async def ensure_default(session: AsyncSession) -> Schedule | None:
    """Promote the newest live schedule when the tenant has no live default.

    Called after a default is deleted (or a schedule restored) so the kiosk
    never silently falls back to "no schedule" while schedules still exist.
    """
    current = await get_default_schedule(session)
    if current is not None:
        return current
    newest = (
        await session.execute(
            select(Schedule)
            .where(Schedule.deleted_at.is_(None))
            .order_by(Schedule.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if newest is not None:
        newest.is_default = True
        await session.flush()
    return newest
