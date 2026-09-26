"""Per-weekday schedule rules (day_hours / day_sessions) — evaluation + validation."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.models import AttendanceStatus, AttendanceType
from app.schemas import ScheduleCreate, ScheduleUpdate
from app.services.attendance_service import (
    AttendanceRuleError,
    _compute_late_minutes,
    compute_status,
    evaluate_scan,
)

ON_TIME, LATE, EARLY = (
    AttendanceStatus.on_time,
    AttendanceStatus.late,
    AttendanceStatus.early_leave,
)
IN, OUT = AttendanceType.check_in, AttendanceType.check_out

# 2026-09-21 is a Monday; 2026-09-25 a Friday; 2026-09-26 a Saturday.
MON, FRI, SAT = datetime(2026, 9, 21), datetime(2026, 9, 25), datetime(2026, 9, 26)

RULES = {
    "type": "shift",
    "day_hours": {
        "1": {"start": "08:00", "end": "17:00"},
        "5": {"start": "07:30", "end": "11:30"},
    },
}


def _schedule(rules: dict, grace: int = 0) -> SimpleNamespace:
    return SimpleNamespace(rules=rules, grace_minutes=grace)


def _at(day: datetime, hhmm: str) -> datetime:
    hh, mm = hhmm.split(":")
    return day.replace(hour=int(hh), minute=int(mm))


def test_check_in_uses_that_days_start():
    s = _schedule(RULES)
    assert compute_status(s, IN, _at(MON, "07:50")) == ON_TIME
    # 07:50 is late on Friday (starts 07:30) but on time on Monday (starts 08:00).
    assert compute_status(s, IN, _at(FRI, "07:50")) == LATE


def test_check_out_uses_that_days_end():
    s = _schedule(RULES)
    assert compute_status(s, OUT, _at(FRI, "11:45")) == ON_TIME
    assert compute_status(s, OUT, _at(MON, "11:45")) == EARLY


def test_grace_applies_per_day():
    s = _schedule(RULES, grace=15)
    assert compute_status(s, IN, _at(FRI, "07:45")) == ON_TIME
    assert compute_status(s, IN, _at(FRI, "07:46")) == LATE


def test_day_off_is_never_penalised():
    s = _schedule(RULES)
    assert compute_status(s, IN, _at(SAT, "13:00")) == ON_TIME
    assert compute_status(s, OUT, _at(SAT, "13:05")) == ON_TIME
    assert _compute_late_minutes(s, _at(SAT, "13:00")) == 0


def test_late_minutes_uses_that_days_start():
    s = _schedule(RULES)
    assert _compute_late_minutes(s, _at(FRI, "08:00")) == 30
    assert _compute_late_minutes(s, _at(MON, "08:00")) == 0


def test_scan_window_follows_day_hours():
    s = _schedule(RULES)
    # Friday ends 11:30, so a 12:00 check-out is allowed; on Monday it is too early.
    kwargs = {"has_checkin": True, "has_checkout": False, "last_record_at": None}
    assert evaluate_scan(s, now=_at(FRI, "12:00"), **kwargs) == AttendanceType.check_out
    with pytest.raises(AttendanceRuleError):
        evaluate_scan(s, now=_at(MON, "12:00"), **kwargs)
    # Day off: no window restriction.
    assert evaluate_scan(s, now=_at(SAT, "10:00"), **kwargs) == AttendanceType.check_out


def test_legacy_flat_hours_still_apply_every_day():
    s = _schedule({"workday_start": "08:00", "workday_end": "16:00"})
    assert compute_status(s, IN, _at(SAT, "08:30")) == LATE


@pytest.mark.parametrize(
    "day_hours",
    [
        {},
        {"0": {"start": "08:00", "end": "17:00"}},
        {"mon": {"start": "08:00", "end": "17:00"}},
        {"1": {"start": "8:00", "end": "17:00"}},
        {"1": {"start": "08:00"}},
        {"1": "08:00-17:00"},
        ["1"],
    ],
)
def test_invalid_day_hours_rejected(day_hours):
    with pytest.raises(ValidationError):
        ScheduleCreate(name="x", rules={"day_hours": day_hours})
    with pytest.raises(ValidationError):
        ScheduleUpdate(rules={"day_hours": day_hours})


def test_valid_day_hours_accepted():
    assert ScheduleCreate(name="x", rules=RULES).rules == RULES
    assert ScheduleUpdate(name="x").rules is None


SESSION_RULES = {
    "type": "session",
    "day_sessions": {
        "1": [{"name": "Sesi 1", "start": "07:30", "end": "09:00"},
              {"name": "Sesi 2", "start": "09:15", "end": "12:00"}],
        "5": [{"name": "Sesi Jumat", "start": "07:00", "end": "10:00"}],
    },
}


def test_session_check_in_uses_that_days_first_session():
    s = _schedule(SESSION_RULES)
    assert compute_status(s, IN, _at(MON, "07:20")) == ON_TIME
    # 07:20 is late on Friday (first session 07:00) but on time on Monday (07:30).
    assert compute_status(s, IN, _at(FRI, "07:20")) == LATE
    assert _compute_late_minutes(s, _at(FRI, "07:20")) == 20


def test_session_check_out_uses_that_days_last_session():
    s = _schedule(SESSION_RULES)
    assert compute_status(s, OUT, _at(FRI, "10:30")) == ON_TIME
    assert compute_status(s, OUT, _at(MON, "10:30")) == EARLY


def test_session_day_off_is_never_penalised():
    s = _schedule(SESSION_RULES)
    assert compute_status(s, IN, _at(SAT, "11:00")) == ON_TIME
    assert compute_status(s, OUT, _at(SAT, "11:05")) == ON_TIME
    assert _compute_late_minutes(s, _at(SAT, "11:00")) == 0
    kwargs = {"has_checkin": True, "has_checkout": False, "last_record_at": None}
    assert evaluate_scan(s, now=_at(SAT, "08:00"), **kwargs) == OUT


def test_session_scan_window_follows_day_sessions():
    s = _schedule(SESSION_RULES)
    kwargs = {"has_checkin": True, "has_checkout": False, "last_record_at": None}
    assert evaluate_scan(s, now=_at(FRI, "10:05"), **kwargs) == OUT
    with pytest.raises(AttendanceRuleError):
        evaluate_scan(s, now=_at(MON, "10:05"), **kwargs)


def test_legacy_flat_sessions_still_apply_every_day():
    sessions = [{"name": "S", "start": "07:30", "end": "09:00"}]
    s = _schedule({"type": "session", "sessions": sessions})
    assert compute_status(s, IN, _at(SAT, "07:45")) == LATE


@pytest.mark.parametrize(
    "day_sessions",
    [
        {},
        {"8": [{"name": "S", "start": "07:00", "end": "08:00"}]},
        {"1": []},
        {"1": {"name": "S", "start": "07:00", "end": "08:00"}},
        {"1": [{"name": "S", "start": "7:00", "end": "08:00"}]},
        {"1": [{"name": "S", "start": "07:00"}]},
    ],
)
def test_invalid_day_sessions_rejected(day_sessions):
    with pytest.raises(ValidationError):
        ScheduleCreate(name="x", rules={"type": "session", "day_sessions": day_sessions})
    with pytest.raises(ValidationError):
        ScheduleUpdate(rules={"type": "session", "day_sessions": day_sessions})


def test_valid_day_sessions_accepted():
    assert ScheduleCreate(name="x", rules=SESSION_RULES).rules == SESSION_RULES
