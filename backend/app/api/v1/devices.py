"""Device (kiosk) management router — AUTH-5.

Tenant admins register kiosk devices. Registration returns a one-time plaintext
token (only its hash is stored); list and revoke manage the device lifecycle.
Kiosks then authenticate via the ``X-Device-Token`` header (get_device_principal).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.core.security import generate_device_token, hash_device_token
from app.models import Device, DeviceStatus
from app.schemas import DeviceCreate, DeviceOut, DeviceRegistered, Envelope
from app.services import audit_service

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
        session, action="device.registered", actor=principal.subject,
        tenant_id=principal.tenant_id, detail={"device_id": device.id, "name": device.name},
    )
    out = DeviceRegistered.model_validate(
        {**DeviceOut.model_validate(device).model_dump(), "token": token}
    )
    return Envelope(data=out)


@router.get("", response_model=Envelope[list[DeviceOut]])
async def list_devices(
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[DeviceOut]]:
    # RLS restricts rows to the caller's tenant.
    result = await session.execute(select(Device).order_by(Device.created_at.desc()))
    devices = list(result.scalars())
    return Envelope(data=[DeviceOut.model_validate(d) for d in devices])


@router.post("/{device_id}/revoke", response_model=Envelope[DeviceOut])
async def revoke_device(
    device_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[DeviceOut]:
    device = (
        await session.execute(select(Device).where(Device.id == device_id))
    ).scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    device.status = DeviceStatus.revoked
    await session.flush()
    await audit_service.record(
        session, action="device.revoked", actor=principal.subject,
        tenant_id=device.tenant_id, detail={"device_id": device.id},
    )
    return Envelope(data=DeviceOut.model_validate(device))
