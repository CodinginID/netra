"""Daily usage snapshot service — background job for usage billing.

Records daily peak usage metrics per tenant (active users, devices used,
punch count) by scanning attendance records from the previous day.
Each tenant with an active subscription gets one snapshot per day.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionFactory, _set_tenant
from app.models import (
    AttendanceRecord,
    TenantSubscription,
    UsageSnapshot,
)
from app.services import billing_service


def _get_yesterday() -> datetime:
    """Yesterday at 00:00 UTC."""
    return (datetime.now(timezone.utc) - timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def _get_period_start() -> datetime:
    """Today at 00:00 UTC (for the latest snapshot)."""
    now = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return now


async def record_for_tenant(
    session: AsyncSession, tenant_id: str
) -> UsageSnapshot | None:
    """Record usage snapshot for a single tenant using current session.

    Skips tenants without an active subscription. Returns the
    UsageSnapshot object if recorded, or None if skipped.
    """
    snap_date = _get_yesterday()

    # Check subscription is active and not ended
    stmt = select(TenantSubscription).where(
        TenantSubscription.tenant_id == tenant_id
    )
    sub = (await session.execute(stmt)).scalar_one_or_none()
    if not sub or sub.status.value != "active":
        return None
    if sub.ends_at and sub.ends_at < _get_period_start():
        return None

    # Count active users today
    today_start = _get_period_start()
    stmt = (
        select(func.count(func.distinct(AttendanceRecord.user_id)))
        .where(
            AttendanceRecord.tenant_id == tenant_id,
            AttendanceRecord.occurred_at >= today_start,
        )
    )
    result = await session.execute(stmt)
    active_users = result.scalar() or 0

    # Count active devices today
    stmt = (
        select(func.count(func.distinct(AttendanceRecord.device_id)))
        .where(
            AttendanceRecord.tenant_id == tenant_id,
            AttendanceRecord.occurred_at >= today_start,
            AttendanceRecord.device_id.isnot(None),
        )
    )
    result = await session.execute(stmt)
    devices = result.scalar() or 0

    # Count punches today
    stmt = (
        select(func.count())
        .where(
            AttendanceRecord.tenant_id == tenant_id,
            AttendanceRecord.occurred_at >= today_start,
        )
    )
    result = await session.execute(stmt)
    punches = result.scalar() or 0

    return await billing_service.record_usage_snapshot(
        session, tenant_id, snap_date.strftime("%Y-%m-%d"),
        active_users, devices, punches,
    )


async def record_all() -> dict:
    """Record usage snapshots for all tenants with active subscriptions.

    Returns dict with counts: processed, inserted, updated, skipped.
    """
    counts = {"processed": 0, "inserted": 0, "updated": 0, "skipped": 0}

    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)

        stmt = select(TenantSubscription).where(
            TenantSubscription.status == "active"
        )
        subs = (await session.execute(stmt)).scalars().all()

        for sub in subs:
            try:
                snapshot = await record_for_tenant(session, sub.tenant_id)
                if snapshot is not None:
                    counts["inserted"] += 1
                else:
                    counts["skipped"] += 1
            except Exception:
                counts["skipped"] += 1

        counts["processed"] = counts["inserted"] + counts["skipped"]

    return counts
