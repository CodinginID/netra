"""Trash management — hard-delete purge of all soft-deleted entities."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_super_admin, require_tenant_admin
from app.models import AttendanceRecord, Device, Schedule, User
from app.schemas import AttendanceOut, DeviceOut, Envelope, ScheduleOut, UserOut
from app.services import audit_service
from app.services.soft_delete import hard_delete, hard_delete_older_than

router = APIRouter(prefix="/trash", tags=["trash"])


@router.get("", response_model=Envelope[dict])
async def list_all_trash(
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    """Combined trash listing: all soft-deleted entities grouped by type (tenant-scoped)."""
    tid = principal.tenant_id
    users_result = await session.execute(
        select(User).where(User.deleted_at.isnot(None), User.tenant_id == tid).order_by(User.deleted_at.desc())
    )
    devices_result = await session.execute(
        select(Device).where(Device.deleted_at.isnot(None), Device.tenant_id == tid).order_by(Device.deleted_at.desc())
    )
    schedules_result = await session.execute(
        select(Schedule).where(Schedule.deleted_at.isnot(None), Schedule.tenant_id == tid).order_by(Schedule.deleted_at.desc())
    )
    attendance_result = await session.execute(
        select(AttendanceRecord)
        .where(AttendanceRecord.deleted_at.isnot(None), AttendanceRecord.tenant_id == tid)
        .order_by(AttendanceRecord.deleted_at.desc())
    )
    return Envelope(
        data={
            "users": [UserOut.model_validate(u) for u in users_result.scalars()],
            "devices": [DeviceOut.model_validate(d) for d in devices_result.scalars()],
            "schedules": [ScheduleOut.model_validate(s) for s in schedules_result.scalars()],
            "attendance": [
                AttendanceOut.model_validate(r) for r in attendance_result.scalars()
            ],
        }
    )


@router.delete("/users/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_trash_user(
    entity_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a soft-deleted user from the trash."""
    if not await hard_delete(session, User, entity_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found or not soft-deleted")
    await audit_service.record(
        session,
        action="trash.hard_deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"entity_type": "user", "entity_id": entity_id},
    )


@router.delete("/devices/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_trash_device(
    entity_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a soft-deleted device from the trash."""
    if not await hard_delete(session, Device, entity_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found or not soft-deleted")
    await audit_service.record(
        session,
        action="trash.hard_deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"entity_type": "device", "entity_id": entity_id},
    )


@router.delete("/schedules/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_trash_schedule(
    entity_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a soft-deleted schedule from the trash."""
    if not await hard_delete(session, Schedule, entity_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found or not soft-deleted")
    await audit_service.record(
        session,
        action="trash.hard_deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"entity_type": "schedule", "entity_id": entity_id},
    )


@router.post("/purge", status_code=status.HTTP_200_OK)
async def purge_trash(
    principal: Principal = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    """Permanently delete all soft-deleted entities older than 30 days. Super-admin only."""
    users_deleted = await hard_delete_older_than(session, User, days=30)
    devices_deleted = await hard_delete_older_than(session, Device, days=30)
    schedules_deleted = await hard_delete_older_than(session, Schedule, days=30)
    attendance_deleted = await hard_delete_older_than(session, AttendanceRecord, days=30)

    await audit_service.record(
        session,
        action="trash.purged",
        actor=principal.subject,
        tenant_id=None,
        detail={
            "users": users_deleted,
            "devices": devices_deleted,
            "schedules": schedules_deleted,
            "attendance": attendance_deleted,
        },
    )
    # No commit here: get_db owns it. Committing mid-request would drop the
    # transaction-local tenant binding for anything queried afterwards.

    return Envelope(
        data={
            "purged": {
                "users": users_deleted,
                "devices": devices_deleted,
                "schedules": schedules_deleted,
                "attendance": attendance_deleted,
                "total": users_deleted + devices_deleted + schedules_deleted + attendance_deleted,
            }
        }
    )
