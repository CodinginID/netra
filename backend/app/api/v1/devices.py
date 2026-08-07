"""Device (kiosk) management router — AUTH-5.

Tenant admins register kiosk devices. Registration returns a one-time plaintext
token (only its hash is stored); list and revoke manage the device lifecycle.
Kiosks then authenticate via the ``X-Device-Token`` header (get_device_principal).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.core.logging import get_logger
from app.core.security import generate_device_token, hash_device_token
from app.models import Device, DeviceStatus
from app.schemas import DeviceCreate, DeviceOut, DeviceRegistered, DeviceUpdate, Envelope
from app.services import audit_service
from app.services.soft_delete import restore as soft_restore, soft_delete
from app.websocket import manager

log = get_logger("netra.devices")

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", response_model=Envelope[DeviceRegistered], status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceCreate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[DeviceRegistered]:
    """Register a kiosk device. Returns the plaintext token ONCE; only its hash is stored."""
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    token = generate_device_token()
    device = Device(
        tenant_id=principal.tenant_id,
        name=payload.name,
        token_hash=hash_device_token(token),
        status=DeviceStatus.active,
    )
    session.add(device)
    await session.flush()
    await audit_service.record(
        session,
        action="device.registered",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"device_id": device.id, "name": device.name},
    )
    out = DeviceRegistered.model_validate(
        {**DeviceOut.model_validate(device).model_dump(), "token": token}
    )
    return Envelope(data=out)


@router.get("", response_model=Envelope[dict])
async def list_devices(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    base = select(Device).where(
        Device.deleted_at.is_(None),
        Device.tenant_id == principal.tenant_id,
    )
    count_stmt = select(func.count(Device.id)).select_from(Device).where(
        Device.deleted_at.is_(None),
        Device.tenant_id == principal.tenant_id,
    )
    total = (await session.execute(count_stmt)).scalar() or 0
    offset = (page - 1) * limit
    items_result = await session.execute(
        base.order_by(Device.created_at.desc()).offset(offset).limit(limit)
    )
    items = [DeviceOut.model_validate(d) for d in items_result.scalars()]
    pages = (total + limit - 1) // limit if total > 0 else 0
    return Envelope(data={"items": items, "total": total, "page": page, "limit": limit, "pages": pages})


@router.post("/{device_id}/revoke", response_model=Envelope[DeviceOut])
async def revoke_device(
    device_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[DeviceOut]:
    device = (
        await session.execute(select(Device).where(
            Device.id == device_id,
            Device.tenant_id == principal.tenant_id,
        ))
    ).scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    device.status = DeviceStatus.revoked
    await session.flush()
    await audit_service.record(
        session,
        action="device.revoked",
        actor=principal.subject,
        tenant_id=device.tenant_id,
        detail={"device_id": device.id},
    )

    # Publish WebSocket event (best-effort)
    try:
        event = {
            "type": "device.revoked",
            "tenant_id": device.tenant_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": {
                "device_id": device.id,
                "device_name": device.name,
            },
        }
        await manager.broadcast(f"tenant:{device.tenant_id}", event)
        await manager.broadcast(f"device:{device.id}", event)
    except Exception:
        log.exception("device_event_publish_failed")

    return Envelope(data=DeviceOut.model_validate(device))


@router.post("/{device_id}/regenerate-token", response_model=Envelope[DeviceRegistered])
async def regenerate_device_token(
    device_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[DeviceRegistered]:
    """Issue a FRESH one-time token for an existing device.

    Use when the kiosk lost its token (e.g. browser storage cleared) — the
    device keeps its identity/history. The previous token is invalidated
    immediately (the hash is overwritten) and the device is (re)activated.
    The new plaintext token is returned ONCE.
    """
    device = (
        await session.execute(select(Device).where(
            Device.id == device_id,
            Device.tenant_id == principal.tenant_id,
        ))
    ).scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    token = generate_device_token()
    device.token_hash = hash_device_token(token)
    device.status = DeviceStatus.active
    await session.flush()
    await audit_service.record(
        session,
        action="device.token_regenerated",
        actor=principal.subject,
        tenant_id=device.tenant_id,
        detail={"device_id": device.id},
    )
    out = DeviceRegistered.model_validate(
        {**DeviceOut.model_validate(device).model_dump(), "token": token}
    )
    return Envelope(data=out)


@router.patch("/{device_id}", response_model=Envelope[DeviceOut])
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[DeviceOut]:
    device = (
        await session.execute(select(Device).where(
            Device.id == device_id,
            Device.tenant_id == principal.tenant_id,
        ))
    ).scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if payload.name is not None:
        device.name = payload.name
    await session.flush()
    await audit_service.record(
        session,
        action="device.updated",
        actor=principal.subject,
        tenant_id=device.tenant_id,
        detail={"device_id": device.id},
    )
    return Envelope(data=DeviceOut.model_validate(device))


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    if not await soft_delete(session, Device, device_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Device not found or already deleted"
        )
    await audit_service.record(
        session,
        action="device.deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"device_id": device_id},
    )


@router.get("/trash", response_model=Envelope[list[DeviceOut]])
async def list_deleted_devices(
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[DeviceOut]]:
    """List soft-deleted devices (recycle bin)."""
    result = await session.execute(
        select(Device).where(
            Device.deleted_at.isnot(None),
            Device.tenant_id == principal.tenant_id,
        ).order_by(Device.deleted_at.desc())
    )
    return Envelope(data=[DeviceOut.model_validate(d) for d in result.scalars()])


@router.post("/{device_id}/restore", response_model=Envelope[DeviceOut])
async def restore_device(
    device_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[DeviceOut]:
    """Restore a soft-deleted device."""
    restored = await soft_restore(session, Device, device_id)
    if not restored:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Device not found or not deleted"
        )
    device = (await session.execute(
        select(Device).where(
            Device.id == device_id,
            Device.tenant_id == principal.tenant_id,
        )
    )).scalar_one()
    await audit_service.record(
        session,
        action="device.restored",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"device_id": device_id},
    )
    return Envelope(data=DeviceOut.model_validate(device))
