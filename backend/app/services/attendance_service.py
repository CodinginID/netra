"""Attendance recording + rule evaluation (on_time / late / early_leave).

Status is derived from the tenant's schedule (workday hours in ``rules`` +
``grace_minutes``). With no schedule/hours configured, everything is on_time.
Time-of-day comparison uses ``occurred_at`` as-presented (the caller is
responsible for sending a tenant-local timestamp); this is a deliberate
skeleton — DST/timezone normalization is a later refinement.
"""

from __future__ import annotations

import math
from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import AttendanceRecord, AttendanceStatus, AttendanceType, Schedule
from app.websocket import manager

log = get_logger("netra.attendance")


class GeofenceError(Exception):
    """Raised when a check-in is outside a geofenced schedule's allowed area."""


class AttendanceRuleError(Exception):
    """A scan violates the dedup / schedule-window rules (maps to HTTP 409)."""


# How close-together two scans may be before the second is treated as an
# accidental double-tap, and how early (minutes before scheduled start) check-in
# is allowed to open.
COOLDOWN_SECONDS = 60
EARLY_CHECKIN_MARGIN_MIN = 120


def _fmt_minutes(total: int) -> str:
    total = max(0, total) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _window_bounds(schedule: "Schedule | None") -> tuple[time | None, time | None]:
    """(start, end) time-of-day for the schedule, for shift or session rules."""
    if schedule is None:
        return None, None
    rules = schedule.rules or {}
    if rules.get("type") == "session":
        sessions = rules.get("sessions") or []
        if not sessions:
            return None, None
        return _parse_hhmm(sessions[0].get("start")), _parse_hhmm(sessions[-1].get("end"))
    return _parse_hhmm(rules.get("workday_start")), _parse_hhmm(rules.get("workday_end"))


def evaluate_scan(
    schedule: "Schedule | None",
    *,
    has_checkin: bool,
    has_checkout: bool,
    last_record_at: datetime | None,
    now: datetime,
) -> AttendanceType:
    """Decide check_in vs check_out for a touchless scan, enforcing:

    - cooldown (ignore accidental rapid re-scans),
    - one check-in + one check-out per day,
    - schedule windows: check-in can't happen long before the start; check-out
      can't happen before the scheduled end (anti early-leave fraud).

    ``now`` MUST be in the tenant's local timezone (HH:MM comparisons).
    Raises AttendanceRuleError on any violation (caller maps to HTTP 409).
    """
    if last_record_at is not None:
        if (now - last_record_at).total_seconds() < COOLDOWN_SECONDS:
            raise AttendanceRuleError("Baru saja absen — tunggu sebentar lalu coba lagi.")

    if has_checkin and has_checkout:
        raise AttendanceRuleError("Absensi hari ini sudah lengkap (masuk & pulang).")

    start_t, end_t = _window_bounds(schedule)
    now_m = now.hour * 60 + now.minute

    if not has_checkin:
        if start_t is not None:
            open_m = start_t.hour * 60 + start_t.minute - EARLY_CHECKIN_MARGIN_MIN
            if now_m < open_m:
                raise AttendanceRuleError(
                    f"Belum waktunya absen masuk. Dibuka pukul {_fmt_minutes(open_m)}."
                )
        return AttendanceType.check_in

    # Has an open check-in → this scan is the check-out.
    if end_t is not None:
        end_m = end_t.hour * 60 + end_t.minute
        if now_m < end_m:
            raise AttendanceRuleError(
                f"Belum waktunya pulang. Jam pulang pukul {end_t.strftime('%H:%M')}."
            )
    return AttendanceType.check_out


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def enforce_geofence(schedule: Schedule | None, location: dict | None) -> None:
    """If the schedule defines a geofence, require the punch to be inside it.

    geofence shape: ``{"lat": float, "lng": float, "radius_m": float}``.
    """
    if schedule is None or not schedule.geofence:
        return
    gf = schedule.geofence
    if not location or location.get("lat") is None or location.get("lng") is None:
        raise GeofenceError("location required for a geofenced schedule")
    dist = _haversine_m(
        float(gf["lat"]), float(gf["lng"]), float(location["lat"]), float(location["lng"])
    )
    if dist > float(gf.get("radius_m", 0)):
        raise GeofenceError(f"outside geofence ({int(dist)}m > {int(gf['radius_m'])}m)")


def is_outside_geofence(schedule: Schedule | None, location: dict | None) -> bool | None:
    """Non-blocking geofence check for 'flag' mode.

    Returns True if the punch is outside the schedule's geofence, False if
    inside, and None when it can't be determined (no geofence configured or no
    location captured). Unlike enforce_geofence this never raises — the caller
    records the punch either way and stores the flag.
    """
    if schedule is None or not schedule.geofence:
        return None
    gf = schedule.geofence
    if not location or location.get("lat") is None or location.get("lng") is None:
        return None
    dist = _haversine_m(
        float(gf["lat"]), float(gf["lng"]), float(location["lat"]), float(location["lng"])
    )
    return dist > float(gf.get("radius_m", 0))


def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    try:
        hh, mm = value.split(":")
        return time(int(hh), int(mm))
    except (ValueError, AttributeError):
        return None


def _compute_session_status(
    rules: dict,
    grace_minutes: int,
    att_type: AttendanceType,
    now_t: time,
) -> AttendanceStatus:
    """Status for session-based schedules (school / university periods)."""
    sessions = rules.get("sessions") or []
    if not sessions:
        return AttendanceStatus.on_time
    now_m = now_t.hour * 60 + now_t.minute

    if att_type == AttendanceType.check_in:
        first_start = _parse_hhmm(sessions[0].get("start"))
        if first_start is None:
            return AttendanceStatus.on_time
        cutoff = first_start.hour * 60 + first_start.minute + grace_minutes
        return AttendanceStatus.late if now_m > cutoff else AttendanceStatus.on_time

    # check_out: compare against last session end
    last_end = _parse_hhmm(sessions[-1].get("end"))
    if last_end is None:
        return AttendanceStatus.on_time
    end_m = last_end.hour * 60 + last_end.minute
    return AttendanceStatus.early_leave if now_m < end_m else AttendanceStatus.on_time


def compute_status(
    schedule: Schedule | None,
    att_type: AttendanceType,
    occurred_at: datetime,
) -> AttendanceStatus:
    if schedule is None:
        return AttendanceStatus.on_time

    rules = schedule.rules or {}
    now_t = occurred_at.time()

    # Holiday: no late / early-leave penalty on configured non-working days.
    holidays = rules.get("holidays") or []
    if occurred_at.date().isoformat() in holidays:
        return AttendanceStatus.on_time

    # Session-based schedule (school / university periods)
    if rules.get("type") == "session":
        return _compute_session_status(rules, schedule.grace_minutes or 0, att_type, now_t)

    # Shift-based (default)
    if att_type == AttendanceType.check_in:
        start = _parse_hhmm(rules.get("workday_start"))
        if start is None:
            return AttendanceStatus.on_time
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


def _compute_late_minutes(
    schedule: Schedule | None,
    occurred_at: datetime,
) -> int:
    """Return how many minutes past the scheduled start the punch occurred."""
    if schedule is None:
        return 0
    rules = schedule.rules or {}
    if rules.get("type") == "session":
        sessions = rules.get("sessions") or []
        if not sessions:
            return 0
        first_start = _parse_hhmm(sessions[0].get("start"))
        if first_start is None:
            return 0
        cutoff = first_start.hour * 60 + first_start.minute
    else:
        start = _parse_hhmm(rules.get("workday_start"))
        if start is None:
            return 0
        cutoff = start.hour * 60 + start.minute
    actual = occurred_at.hour * 60 + occurred_at.minute
    return max(0, actual - cutoff)


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

    # Publish WebSocket event (best-effort — must never break attendance recording)
    try:
        event = {
            "type": "attendance.recorded",
            "tenant_id": tenant_id,
            "timestamp": rec.occurred_at.isoformat(),
            "data": {
                "user_id": user_id,
                "att_type": att_type.value,
                "status": status.value,
                "occurred_at": rec.occurred_at.isoformat(),
                "liveness_score": liveness_score,
                "device_id": device_id,
            },
        }
        await manager.broadcast(f"tenant:{tenant_id}", event)

        if status == AttendanceStatus.late:
            late_event = {
                "type": "attendance.late",
                "tenant_id": tenant_id,
                "timestamp": rec.occurred_at.isoformat(),
                "data": {
                    "user_id": user_id,
                    "att_type": att_type.value,
                    "status": status.value,
                    "occurred_at": rec.occurred_at.isoformat(),
                    "liveness_score": liveness_score,
                    "device_id": device_id,
                    "late_minutes": _compute_late_minutes(schedule, occurred_at),
                },
            }
            await manager.broadcast(f"tenant:{tenant_id}", late_event)
    except Exception:
        log.exception("attendance_event_publish_failed")

    return rec


async def list_records(
    session: AsyncSession, *, user_id: str | None = None
) -> list[AttendanceRecord]:
    stmt = select(AttendanceRecord).order_by(AttendanceRecord.occurred_at.desc())
    if user_id is not None:
        stmt = stmt.where(AttendanceRecord.user_id == user_id)
    return list((await session.execute(stmt)).scalars())
