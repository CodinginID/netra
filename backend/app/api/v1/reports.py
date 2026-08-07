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
from app.schemas import Envelope, TenantConfig
from app.services import report_service, tenant_service

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
    principal: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[AttendanceRecapOut]:
    day = _parse_date(date_str)
    recap = await report_service.daily_recap(session, day, principal.tenant_id)
    return Envelope(data=_to_recap_out(recap))


@router.get("/attendance/monthly", response_model=Envelope[AttendanceRecapOut])
async def monthly_report(
    month: str = Query(..., description="YYYY-MM"),
    principal: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[AttendanceRecapOut]:
    year, mon = _parse_month(month)
    recap = await report_service.monthly_recap(session, year, mon, principal.tenant_id)
    return Envelope(data=_to_recap_out(recap))


class DailyStatusOut(BaseModel):
    user_id: str
    full_name: str
    external_id: str | None
    status: Literal["absent", "present", "late", "checked_out"]
    check_in_at: datetime | None
    check_out_at: datetime | None


@router.get("/attendance/status", response_model=Envelope[list[DailyStatusOut]])
async def daily_status(
    date_str: str = Query(..., alias="date", description="YYYY-MM-DD"),
    principal: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[DailyStatusOut]]:
    """Roster of every active end-user with their attendance state for the day,
    including those who haven't shown up ('absent')."""
    day = _parse_date(date_str)
    tenant = await tenant_service.get_tenant(session, principal.tenant_id)
    cfg = TenantConfig.model_validate((tenant.config if tenant else None) or {})
    rows = await report_service.daily_status(session, day, cfg.attendance.timezone, principal.tenant_id)
    return Envelope(
        data=[
            DailyStatusOut(
                user_id=r.user_id,
                full_name=r.full_name,
                external_id=r.external_id,
                status=r.status,  # type: ignore[arg-type]
                check_in_at=r.check_in_at,
                check_out_at=r.check_out_at,
            )
            for r in rows
        ]
    )


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


def _pdf_bytes(rows: list[report_service.ExportRow]) -> bytes:
    # Lazy import: reportlab is a heavy, optional export dependency. Importing it
    # here (not at module load) keeps the whole API bootable even if it isn't
    # installed; only PDF export fails, with a clear 503.
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
    except ImportError as exc:  # pragma: no cover - depends on optional dep
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF export unavailable (reportlab not installed).",
        ) from exc

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch)

    elements = []
    elements.append(
        Table(
            [["Attendance Report"]],
            colWidths=[7 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1a73e8")),
                    ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 14),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
        )
    )

    header_data = [col.replace("_", " ").title() for col in _EXPORT_COLUMNS]
    data = [header_data]
    for r in rows:
        data.append(
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

    col_widths = [
        1.2 * inch, 1.0 * inch, 1.5 * inch, 0.8 * inch,
        0.8 * inch, 0.8 * inch, 0.9 * inch,
    ]
    tbl = Table(data, colWidths=col_widths)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f3f4")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("FONTSIZE", (0, 1), (-1, -1), 7),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(tbl)

    doc.build(elements)
    return buf.getvalue()


@router.get("/attendance/export")
async def export_report(
    from_str: str = Query(..., alias="from", description="YYYY-MM-DD (inclusive)"),
    to_str: str = Query(..., alias="to", description="YYYY-MM-DD (inclusive)"),
    fmt: Literal["csv", "xlsx", "pdf"] = Query("csv", alias="format"),
    principal: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    start_day = _parse_date(from_str)
    end_day = _parse_date(to_str)
    if end_day < start_day:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'to' must not be earlier than 'from'",
        )

    rows = await report_service.export_rows(session, start_day, end_day, principal.tenant_id)
    filename = f"attendance_{from_str}_{to_str}.{fmt}"

    if fmt == "csv":
        payload = _csv_bytes(rows)
        media_type = "text/csv"
    elif fmt == "xlsx":
        payload = _xlsx_bytes(rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        payload = _pdf_bytes(rows)
        media_type = "application/pdf"

    return StreamingResponse(
        io.BytesIO(payload),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
