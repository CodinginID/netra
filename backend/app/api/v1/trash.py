"""Trash management — hard-delete purge of all soft-deleted entities."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin, get_db
from app.models import Device, Schedule, User
from app.schemas import Envelope
from app.services import audit_service
from app.services.soft_delete import hard_delete_older_than

router = APIRouter(prefix="/trash", tags=["trash"])


@router.post("/purge", status_code=status.HTTP_200_OK)
async def purge_trash(
    principal: str = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    """Permanently delete all soft-deleted entities older than 30 days. Super-admin only."""
    users_deleted = await hard_delete_older_than(session, User, days=30)
    devices_deleted = await hard_delete_older_than(session, Device, days=30)
    schedules_deleted = await hard_delete_older_than(session, Schedule, days=30)

    await audit_service.record(
        session,
        action="trash.purged",
        actor=principal.subject,
        tenant_id=None,
        detail={
            "users": users_deleted,
            "devices": devices_deleted,
            "schedules": schedules_deleted,
        },
    )
    await session.commit()

    return Envelope(
        data={
            "purged": {
                "users": users_deleted,
                "devices": devices_deleted,
                "schedules": schedules_deleted,
                "total": users_deleted + devices_deleted + schedules_deleted,
            }
        }
    )
