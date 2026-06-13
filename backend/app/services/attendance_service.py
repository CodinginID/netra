"""Attendance recording + rule evaluation (on_time / late / early_leave).

Status is derived from the tenant's schedule (workday hours in ``rules`` +
``grace_minutes``). With no schedule/hours configured, everything is on_time.
Time-of-day comparison uses ``occurred_at`` as-presented (the caller is
responsible for sending a tenant-local timestamp); this is a deliberate
skeleton — DST/timezone normalization is a later refinement.
"""

from __future__ import annotations

from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AttendanceRecord, AttendanceStatus, AttendanceType, Schedule


def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    try:
        hh, mm = value.split(":")
        return time(int(hh), int(mm))
    except (ValueError, AttributeError):
        return None


def compute_status(
    schedule: Schedule | None,
    att_type: AttendanceType,
    occurred_at: datetime,
) -> AttendanceStatus:
    if schedule is None:
        return AttendanceStatus.on_time

    rules = schedule.rules or {}
    now_t = occurred_at.time()

    if att_type == AttendanceType.check_in:
        start = _parse_hhmm(rules.get("workday_start"))
        if start is None:
            return AttendanceStatus.on_time
        # Allowed grace after start.
        grace_minutes = schedule.grace_minutes or 0
        cutoff_minutes = start.hour * 60 + start.minute + grace_minutes
        actual_minutes = now_t.hour * 60 + now_t.minute
        return (
            AttendanceStatus.late if actual_minutes > cutoff_minutes else AttendanceStatus.on_time
        )

    # check_out
    end = _parse_hhmm(rules.get("workday_end"))
    if end is None:
        return AttendanceStatus.on_time
    end_minutes = end.hour * 60 + end.minute
    actual_minutes = now_t.hour * 60 + now_t.minute
    return (
        AttendanceStatus.early_leave if actual_minutes < end_minutes else AttendanceStatus.on_time
    )


async def record(
    session: AsyncSession,
    tenant_id: str,
    user_id: str,
    *,
    att_type: AttendanceType,
    occurred_at: datetime,
    schedule: Schedule | None = None,
    location: dict | None = None,
    liveness_score: float | None = None,
    device_id: str | None = None,
) -> AttendanceRecord:
    status = compute_status(schedule, att_type, occurred_at)
    rec = AttendanceRecord(
        tenant_id=tenant_id,
        user_id=user_id,
        type=att_type,
        status=status,
        occurred_at=occurred_at,
        location=location,
        liveness_score=liveness_score,
        device_id=device_id,
    )
    session.add(rec)
    await session.flush()
    return rec


async def list_records(
    session: AsyncSession, *, user_id: str | None = None
) -> list[AttendanceRecord]:
    stmt = select(AttendanceRecord).order_by(AttendanceRecord.occurred_at.desc())
    if user_id is not None:
        stmt = stmt.where(AttendanceRecord.user_id == user_id)
    return list((await session.execute(stmt)).scalars())
