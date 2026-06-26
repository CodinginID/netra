"""Attendance schedule management (tenant-scoped via RLS)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_staff, require_tenant_admin
from app.models import Schedule
from app.schemas import Envelope, ScheduleCreate, ScheduleOut
from app.services import audit_service, schedule_service
from app.services.soft_delete import restore as soft_restore, soft_delete

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.post("", response_model=Envelope[ScheduleOut], status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[ScheduleOut]:
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    schedule = await schedule_service.create_schedule(
        session,
        principal.tenant_id,
        name=payload.name,
        rules=payload.rules,
        grace_minutes=payload.grace_minutes,
        geofence=payload.geofence,
        is_default=payload.is_default,
    )
    await audit_service.record(
        session,
        action="schedule.created",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"schedule_id": schedule.id, "is_default": schedule.is_default},
    )
    return Envelope(data=ScheduleOut.model_validate(schedule))


@router.get("", response_model=Envelope[dict])
async def list_schedules(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    _: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    base = select(Schedule).where(Schedule.deleted_at.is_(None))
    count_stmt = select(func.count(Schedule.id)).select_from(Schedule).where(Schedule.deleted_at.is_(None))
    total = (await session.execute(count_stmt)).scalar() or 0
    offset = (page - 1) * limit
    items_result = await session.execute(
        base.order_by(Schedule.created_at.desc()).offset(offset).limit(limit)
    )
    items = [ScheduleOut.model_validate(s) for s in items_result.scalars()]
    pages = (total + limit - 1) // limit if total > 0 else 0
    return Envelope(data={"items": items, "total": total, "page": page, "limit": limit, "pages": pages})


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    await soft_delete(session, Schedule, schedule_id)
    await audit_service.record(
        session,
        action="schedule.deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"schedule_id": schedule_id},
    )


@router.get("/trash", response_model=Envelope[list[ScheduleOut]])
async def list_deleted_schedules(
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[ScheduleOut]]:
    """List soft-deleted schedules (recycle bin)."""
    result = await session.execute(
        select(Schedule).where(Schedule.deleted_at.isnot(None)).order_by(Schedule.deleted_at.desc())
    )
    return Envelope(data=[ScheduleOut.model_validate(s) for s in result.scalars()])


@router.post("/{schedule_id}/restore", response_model=Envelope[ScheduleOut])
async def restore_schedule(
    schedule_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[ScheduleOut]:
    """Restore a soft-deleted schedule."""
    restored = await soft_restore(session, Schedule, schedule_id)
    if not restored:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found or not deleted"
        )
    schedule = (await session.execute(select(Schedule).where(Schedule.id == schedule_id))).scalar_one()
    await audit_service.record(
        session,
        action="schedule.restored",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"schedule_id": schedule_id},
    )
    return Envelope(data=ScheduleOut.model_validate(schedule))
