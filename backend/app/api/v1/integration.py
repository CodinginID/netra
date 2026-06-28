"""Public integration API (server-to-server, API-key authenticated).

This is the surface a tenant's OWN application calls to pull attendance data
into their dashboard. Authentication is by tenant API key (scope-checked), and
every query is automatically tenant-isolated by RLS via get_api_db.

Read-only by design. Auth: send the key as ``X-API-Key: ntr_live_…`` or
``Authorization: Bearer ntr_live_…``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ApiPrincipal, get_api_db, require_scope
from app.api.v1.reports import DailyStatusOut
from app.models import AttendanceRecord
from app.schemas import AttendanceOut, Envelope, TenantConfig
from app.services import report_service, tenant_service

router = APIRouter(prefix="/integration", tags=["integration"])

ATTENDANCE_READ = require_scope("attendance:read")


def _parse_day(value: str, field: str) -> datetime:
    try:
        d = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid '{field}' date, expected YYYY-MM-DD",
        ) from exc
    return d


@router.get("/attendance", response_model=Envelope[dict])
async def list_attendance(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=1000),
    user_id: str | None = Query(None, description="Filter to a single user"),
    date_from: str | None = Query(None, alias="from", description="YYYY-MM-DD (inclusive)"),
    date_to: str | None = Query(None, alias="to", description="YYYY-MM-DD (inclusive)"),
    _: ApiPrincipal = Depends(ATTENDANCE_READ),
    session: AsyncSession = Depends(get_api_db),
) -> Envelope[dict]:
    """Paginated attendance records for the calling tenant."""
    filters = [AttendanceRecord.deleted_at.is_(None)]
    if user_id is not None:
        filters.append(AttendanceRecord.user_id == user_id)
    if date_from is not None:
        filters.append(AttendanceRecord.occurred_at >= _parse_day(date_from, "from"))
    if date_to is not None:
        # inclusive end → strictly before the next day
        filters.append(AttendanceRecord.occurred_at < _parse_day(date_to, "to") + timedelta(days=1))

    total = (
        await session.execute(select(func.count(AttendanceRecord.id)).where(*filters))
    ).scalar() or 0
    offset = (page - 1) * limit
    rows = (
        await session.execute(
            select(AttendanceRecord)
            .where(*filters)
            .order_by(AttendanceRecord.occurred_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars()
    items = [AttendanceOut.model_validate(r) for r in rows]
    pages = (total + limit - 1) // limit if total > 0 else 0
    return Envelope(
        data={"items": items, "total": total, "page": page, "limit": limit, "pages": pages}
    )


@router.get("/attendance/daily-status", response_model=Envelope[list[DailyStatusOut]])
async def daily_status(
    date_str: str = Query(..., alias="date", description="YYYY-MM-DD"),
    principal: ApiPrincipal = Depends(ATTENDANCE_READ),
    session: AsyncSession = Depends(get_api_db),
) -> Envelope[list[DailyStatusOut]]:
    """Daily roster: every active end-user with their status for the day."""
    day = _parse_day(date_str, "date").date()
    tenant = await tenant_service.get_tenant(session, principal.tenant_id)
    cfg = TenantConfig.model_validate((tenant.config if tenant else None) or {})
    rows = await report_service.daily_status(session, day, cfg.attendance.timezone)
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
