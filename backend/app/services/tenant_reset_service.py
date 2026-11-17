"""Reset a tenant's operational data without deleting the tenant itself.

The tenant row, its config, schedules, API keys, webhooks, SSO, billing and the
audit trail are never touched. Each category is a hard delete scoped by an
explicit ``tenant_id`` filter (the caller runs on the unscoped platform session,
so RLS is not what keeps this inside one tenant).
"""

from __future__ import annotations

from enum import Enum
from typing import Any, cast

from sqlalchemy import CursorResult, Delete, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AttendanceRecord, Device, FaceEmbedding, Role, User


class ResetCategory(str, Enum):
    attendance = "attendance"  # attendance records
    faces = "faces"  # face embeddings; every user goes back to "not enrolled"
    users = "users"  # every user except tenant admins (cascades faces/attendance/consents)
    devices = "devices"  # kiosk devices and their tokens


# Users go first: their cascade removes faces/attendance, so the later counts
# only cover what was left (e.g. the tenant admins' own records).
_ORDER = [
    ResetCategory.users,
    ResetCategory.attendance,
    ResetCategory.faces,
    ResetCategory.devices,
]


async def _delete(session: AsyncSession, stmt: Delete) -> int:
    result = cast(CursorResult[Any], await session.execute(stmt))
    return result.rowcount or 0


async def _reset_attendance(session: AsyncSession, tenant_id: str) -> int:
    return await _delete(
        session, delete(AttendanceRecord).where(AttendanceRecord.tenant_id == tenant_id)
    )


async def _reset_faces(session: AsyncSession, tenant_id: str) -> int:
    removed = await _delete(
        session, delete(FaceEmbedding).where(FaceEmbedding.tenant_id == tenant_id)
    )
    await session.execute(update(User).where(User.tenant_id == tenant_id).values(enrolled=False))
    return removed


async def _reset_users(session: AsyncSession, tenant_id: str) -> int:
    return await _delete(
        session, delete(User).where(User.tenant_id == tenant_id, User.role != Role.tenant_admin)
    )


async def _reset_devices(session: AsyncSession, tenant_id: str) -> int:
    return await _delete(session, delete(Device).where(Device.tenant_id == tenant_id))


_HANDLERS = {
    ResetCategory.attendance: _reset_attendance,
    ResetCategory.faces: _reset_faces,
    ResetCategory.users: _reset_users,
    ResetCategory.devices: _reset_devices,
}


async def reset_tenant_data(
    session: AsyncSession, tenant_id: str, categories: set[ResetCategory]
) -> dict[str, int]:
    """Hard-delete the chosen categories for one tenant; returns rows removed per category."""
    if not categories:
        raise ValueError("choose at least one category to reset")
    removed: dict[str, int] = {}
    for category in _ORDER:
        if category in categories:
            removed[category.value] = await _HANDLERS[category](session, tenant_id)
    await session.flush()
    return removed
