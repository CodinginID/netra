"""Attendance reporting + export (issue #2 "Pelaporan & ekspor").

All endpoints are tenant-scoped via the RLS-bound ``get_db`` session and gated
to staff (super_admin / tenant_admin / supervisor) via ``require_staff``. Recaps
return the standard ``Envelope``; the export endpoint streams a downloadable
CSV or XLSX file.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_staff
from app.schemas import Envelope
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

_EXPORT_COLUMNS = [
    "occurred_at",
    "user_id",
    "full_name",
    "type",
    "status",
    "liveness_score",
    "device_id",
]


# --------------------------------------------------------------------------- #
# Local response models (kept here per file-ownership constraints)
# --------------------------------------------------------------------------- #
class UserRecapOut(BaseModel):
    user_id: str
    full_name: str
    on_time: int
    late: int
    early_leave: int
    check_in: int
    check_out: int


class AttendanceRecapOut(BaseModel):
    period_start: date
    period_end: date
    total_records: int
    on_time: int
    late: int
    early_leave: int
    check_in: int
    check_out: int
    users: list[UserRecapOut]


def _to_recap_out(recap: report_service.AttendanceRecap) -> AttendanceRecapOut:
    return AttendanceRecapOut(
        period_start=recap.period_start,
        period_end=recap.period_end,
        total_records=recap.total_records,
        on_time=recap.on_time,
        late=recap.late,
        early_leave=recap.early_leave,
        check_in=recap.check_in,
        check_out=recap.check_out,
        users=[
            UserRecapOut(
                user_id=u.user_id,
                full_name=u.full_name,
                on_time=u.on_time,
                late=u.late,
                early_leave=u.early_leave,
                check_in=u.check_in,
                check_out=u.check_out,
            )
            for u in recap.users
        ],
    )


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date '{value}', expected YYYY-MM-DD",
        ) from exc


def _parse_month(value: str) -> tuple[int, int]:
    try:
        year_s, month_s = value.split("-")
        year, month = int(year_s), int(month_s)
        if not 1 <= month <= 12 or not 1 <= year <= 9999:
            raise ValueError
    except (ValueError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid month '{value}', expected YYYY-MM",
        ) from exc
    return year, month


# --------------------------------------------------------------------------- #
# JSON recaps
# --------------------------------------------------------------------------- #
@router.get("/attendance/daily", response_model=Envelope[AttendanceRecapOut])
async def daily_report(
    date_str: str = Query(..., alias="date", description="YYYY-MM-DD"),
    _: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[AttendanceRecapOut]:
    day = _parse_date(date_str)
    recap = await report_service.daily_recap(session, day)
    return Envelope(data=_to_recap_out(recap))


@router.get("/attendance/monthly", response_model=Envelope[AttendanceRecapOut])
async def monthly_report(
    month: str = Query(..., description="YYYY-MM"),
    _: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[AttendanceRecapOut]:
    year, mon = _parse_month(month)
    recap = await report_service.monthly_recap(session, year, mon)
    return Envelope(data=_to_recap_out(recap))


# --------------------------------------------------------------------------- #
# Export (CSV / XLSX)
# --------------------------------------------------------------------------- #
def _cell(value: datetime | float | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _csv_bytes(rows: list[report_service.ExportRow]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_COLUMNS)
    for r in rows:
        writer.writerow(
            [
                _cell(r.occurred_at),
                r.user_id,
                r.full_name,
                r.type,
                r.status,
                _cell(r.liveness_score),
                _cell(r.device_id),
            ]
        )
    return buf.getvalue().encode("utf-8")


def _xlsx_bytes(rows: list[report_service.ExportRow]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "attendance"
    ws.append(_EXPORT_COLUMNS)
    for r in rows:
        ws.append(
            [
                _cell(r.occurred_at),
                r.user_id,
                r.full_name,
                r.type,
                r.status,
                r.liveness_score if r.liveness_score is not None else "",
                r.device_id or "",
            ]
        )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/attendance/export")
async def export_report(
    from_str: str = Query(..., alias="from", description="YYYY-MM-DD (inclusive)"),
    to_str: str = Query(..., alias="to", description="YYYY-MM-DD (inclusive)"),
    fmt: Literal["csv", "xlsx"] = Query("csv", alias="format"),
    _: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    start_day = _parse_date(from_str)
    end_day = _parse_date(to_str)
    if end_day < start_day:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'to' must not be earlier than 'from'",
        )

    rows = await report_service.export_rows(session, start_day, end_day)
    filename = f"attendance_{from_str}_{to_str}.{fmt}"

    if fmt == "csv":
        payload = _csv_bytes(rows)
        media_type = "text/csv"
    else:
        payload = _xlsx_bytes(rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return StreamingResponse(
        io.BytesIO(payload),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
