"""Recompute stored attendance status (on_time / late / early_leave).

Status is computed once, at scan time. Punches recorded while a tenant had no
default schedule were all stored as on_time; this re-evaluates them against the
tenant's CURRENT default schedule, in the tenant's timezone. Dry run by default.

Usage:
    uv run python -m scripts.recompute_attendance_status --tenant acme \\
        --from 2026-09-01 --to 2026-09-30            # preview
    uv run python -m scripts.recompute_attendance_status --tenant acme \\
        --from 2026-09-01 --to 2026-09-30 --apply    # write changes
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select

from app.db.session import get_session
from app.models import AttendanceRecord, Tenant, User
from app.schemas import TenantConfig
from app.services import schedule_service
from app.services.attendance_service import compute_status


async def recompute(tenant_ref: str, start: date, end: date, apply: bool) -> None:
    async with get_session(tenant_id=None, platform=True) as session:
        tenant = (
            await session.execute(
                select(Tenant).where(or_(Tenant.id == tenant_ref, Tenant.slug == tenant_ref))
            )
        ).scalar_one_or_none()
    if tenant is None:
        raise SystemExit(f"Tenant '{tenant_ref}' not found (pass its id or slug).")

    tz = ZoneInfo(TenantConfig.model_validate(tenant.config or {}).attendance.timezone)
    day_start = datetime.combine(start, datetime.min.time(), tzinfo=tz)
    day_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=tz)

    async with get_session(tenant_id=tenant.id) as session:
        schedule = await schedule_service.get_default_schedule(session)
        if schedule is None:
            raise SystemExit(
                f"Tenant '{tenant.slug}' has no default schedule — set one in Jadwal Kerja first."
            )
        rows = (
            await session.execute(
                select(AttendanceRecord, User.full_name)
                .join(User, User.id == AttendanceRecord.user_id)
                .where(
                    AttendanceRecord.deleted_at.is_(None),
                    AttendanceRecord.occurred_at >= day_start,
                    AttendanceRecord.occurred_at < day_end,
                )
                .order_by(AttendanceRecord.occurred_at)
            )
        ).all()

        changed = 0
        for rec, full_name in rows:
            local = rec.occurred_at.astimezone(tz)
            status = compute_status(schedule, rec.type, local)
            if status == rec.status:
                continue
            changed += 1
            print(
                f"{local:%Y-%m-%d %H:%M}  {full_name:<30} {rec.type.value:<9} "
                f"{rec.status.value} -> {status.value}"
            )
            if apply:
                rec.status = status

        print(
            f"\nSchedule '{schedule.name}', {len(rows)} records, {changed} to change."
            + ("" if apply else " Dry run — re-run with --apply to write.")
        )
        if not apply:
            await session.rollback()


def main() -> None:
    parser = argparse.ArgumentParser(description="Recompute stored attendance status")
    parser.add_argument("--tenant", required=True, help="tenant id or slug")
    parser.add_argument("--from", dest="start", required=True, type=date.fromisoformat)
    parser.add_argument("--to", dest="end", required=True, type=date.fromisoformat)
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = parser.parse_args()
    if args.end < args.start:
        parser.error("--to must not be before --from")
    asyncio.run(recompute(args.tenant, args.start, args.end, args.apply))


if __name__ == "__main__":
    main()
