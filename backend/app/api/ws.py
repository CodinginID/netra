"""WebSocket endpoint for real-time event push."""
from __future__ import annotations

from sqlalchemy import select
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.logging import get_logger
from app.core.security import JWTError, decode_token, hash_device_token
from app.db.session import SessionFactory, _set_tenant
from app.models import Device, DeviceStatus, Role
from app.websocket import manager

log = get_logger("netra.ws")

router = APIRouter()


async def _auth_device_token(raw_token: str) -> str | None:
    """Validate a kiosk device token; return device_id or None if invalid/revoked."""
    token_hash = hash_device_token(raw_token)
    try:
        async with SessionFactory() as session:
            # Platform context: the tenant is unknown until the device is found.
            await _set_tenant(session, None, platform=True)
            device = (
                await session.execute(select(Device).where(Device.token_hash == token_hash))
            ).scalar_one_or_none()
            if device is None or device.status != DeviceStatus.active:
                return None
            return device.id
    except Exception:
        log.exception("ws_device_auth_error")
        return None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None, description="JWT access token"),
    device_token: str | None = Query(default=None, description="Kiosk device token"),
):
    """WebSocket connection. Auth via JWT (token=) or device token (device_token=).

    Subscriptions:
    - super_admin → platform:all + user channel
    - tenant_admin / supervisor → own tenant channel
    - kiosk (JWT or device_token) → own device channel
    """
    channels: list[str] = []

    if device_token:
        device_id = await _auth_device_token(device_token)
        if device_id is None:
            await websocket.close(code=4001, reason="Invalid or revoked device token")
            return
        channels.append(f"device:{device_id}")
    elif token:
        try:
            claims = decode_token(token)
        except JWTError:
            await websocket.close(code=4001, reason="Invalid token")
            return

        if claims.get("type") != "access":
            await websocket.close(code=4001, reason="Not an access token")
            return

        try:
            role = Role(claims["role"])
        except (KeyError, ValueError):
            await websocket.close(code=4001, reason="Invalid role")
            return

        subject = claims["sub"]
        tenant_id = claims.get("tenant_id")

        if role == Role.super_admin:
            channels.append("platform:all")
            channels.append(f"user:{subject}")
        elif role == Role.kiosk:
            channels.append(f"device:{subject}")
        else:
            if tenant_id:
                channels.append(f"tenant:{tenant_id}")
            channels.append(f"user:{subject}")
    else:
        await websocket.close(code=4001, reason="Missing authentication")
        return

    await manager.connect(websocket, channels)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        log.error("ws_error", error=str(exc))
        manager.disconnect(websocket)
