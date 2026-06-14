"""Attendance reporting aggregations (issue #2 "Pelaporan & ekspor").

Pure SQLAlchemy reads on the tenant-bound (RLS-scoped) session — every query
implicitly sees only the current tenant's ``attendance_records``. Status is the
value computed at capture time (on_time / late / early_leave). Date-range
filtering compares against ``occurred_at`` as-stored (callers send tenant-local
timestamps; timezone normalization is a later refinement — see attendance_service).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AttendanceRecord, AttendanceStatus, AttendanceType, User


@dataclass
class UserRecap:
    """Per-user counts within a reporting window."""

    user_id: str
    full_name: str
    on_time: int = 0
    late: int = 0
    early_leave: int = 0
    check_in: int = 0
    check_out: int = 0


@dataclass
class AttendanceRecap:
    """Aggregated recap over a window: totals + per-user breakdown."""

    period_start: date
    period_end: date
    total_records: int = 0
    on_time: int = 0
    late: int = 0
    early_leave: int = 0
    check_in: int = 0
    check_out: int = 0
    users: list[UserRecap] = field(default_factory=list)


@dataclass
class ExportRow:
    """Flat row for CSV / XLSX export."""

    occurred_at: datetime
    user_id: str
    full_name: str
    type: str
    status: str
    liveness_score: float | None
    device_id: str | None


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    """Inclusive start / exclusive end (UTC) covering a single calendar day."""
    start = datetime.combine(day, time.min, tzinfo=UTC)
    end = datetime.combine(day, time.max, tzinfo=UTC)
    return start, end


def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    """Inclusive start / inclusive end (UTC) covering a calendar month."""
    start = datetime(year, month, 1, tzinfo=UTC)
    # First day of next month minus one day -> last day of this month.
    last_day = date(year, 12, 31) if month == 12 else date(year, month + 1, 1) - timedelta(days=1)
    end = datetime.combine(last_day, time.max, tzinfo=UTC)
    return start, end


async def _recap_for_range(
    session: AsyncSession, start: datetime, end: datetime
) -> AttendanceRecap:
    """Aggregate per-user status / type counts over ``[start, end]`` (inclusive)."""
    recap = AttendanceRecap(period_start=start.date(), period_end=end.date())

    stmt = (
        select(
            AttendanceRecord.user_id,
            User.full_name,
            AttendanceRecord.status,
            AttendanceRecord.type,
            func.count().label("n"),
        )
        .join(User, User.id == AttendanceRecord.user_id)
        .where(AttendanceRecord.occurred_at >= start)
        .where(AttendanceRecord.occurred_at <= end)
        .group_by(
            AttendanceRecord.user_id,
            User.full_name,
            AttendanceRecord.status,
            AttendanceRecord.type,
        )
    )

    by_user: dict[str, UserRecap] = {}
    for user_id, full_name, status, att_type, n in (await session.execute(stmt)).all():
        ur = by_user.get(user_id)
        if ur is None:
            ur = UserRecap(user_id=user_id, full_name=full_name)
            by_user[user_id] = ur

        if status == AttendanceStatus.on_time:
            ur.on_time += n
            recap.on_time += n
        elif status == AttendanceStatus.late:
            ur.late += n
            recap.late += n
        elif status == AttendanceStatus.early_leave:
            ur.early_leave += n
            recap.early_leave += n

        if att_type == AttendanceType.check_in:
            ur.check_in += n
            recap.check_in += n
        elif att_type == AttendanceType.check_out:
            ur.check_out += n
            recap.check_out += n

        recap.total_records += n

    recap.users = sorted(by_user.values(), key=lambda u: u.full_name)
    return recap


async def daily_recap(session: AsyncSession, day: date) -> AttendanceRecap:
    start, end = _day_bounds(day)
    return await _recap_for_range(session, start, end)


async def monthly_recap(session: AsyncSession, year: int, month: int) -> AttendanceRecap:
    start, end = _month_bounds(year, month)
    return await _recap_for_range(session, start, end)


async def export_rows(session: AsyncSession, start_day: date, end_day: date) -> list[ExportRow]:
    """Flat, ordered list of records in ``[start_day, end_day]`` (inclusive)."""
    start, _ = _day_bounds(start_day)
    _, end = _day_bounds(end_day)

    stmt = (
        select(AttendanceRecord, User.full_name)
        .join(User, User.id == AttendanceRecord.user_id)
        .where(AttendanceRecord.occurred_at >= start)
        .where(AttendanceRecord.occurred_at <= end)
        .order_by(AttendanceRecord.occurred_at.asc())
    )

    rows: list[ExportRow] = []
    for rec, full_name in (await session.execute(stmt)).all():
        rows.append(
            ExportRow(
                occurred_at=rec.occurred_at,
                user_id=rec.user_id,
                full_name=full_name,
                type=rec.type.value,
                status=rec.status.value,
                liveness_score=rec.liveness_score,
                device_id=rec.device_id,
            )
        )
    return rows
