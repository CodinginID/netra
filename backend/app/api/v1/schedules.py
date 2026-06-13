"""Attendance schedule management (tenant-scoped via RLS)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_staff, require_tenant_admin
from app.schemas import Envelope, ScheduleCreate, ScheduleOut
from app.services import audit_service, schedule_service

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


@router.get("", response_model=Envelope[list[ScheduleOut]])
async def list_schedules(
    _: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[ScheduleOut]]:
    schedules = await schedule_service.list_schedules(session)
    return Envelope(data=[ScheduleOut.model_validate(s) for s in schedules])
