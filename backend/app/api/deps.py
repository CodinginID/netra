"""FastAPI dependencies: DB session (tenant-bound) + auth principal + RBAC."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import tenant_id_ctx
from app.core.security import JWTError, decode_token, hash_device_token
from app.db.session import SessionFactory, _set_tenant
from app.models import Device, DeviceStatus, Role

# Security schemes — registered with OpenAPI so Swagger UI renders an "Authorize"
# button. auto_error=False lets us return our own 401 (instead of 403) and keep
# the WWW-Authenticate header.
bearer_scheme = HTTPBearer(
    auto_error=False,
    description="Paste the JWT access token from POST /auth/login (without the 'Bearer ' prefix).",
)
device_token_scheme = APIKeyHeader(
    name="X-Device-Token",
    auto_error=False,
    description="Kiosk device token returned once when registering a device.",
)


@dataclass
class Principal:
    """Authenticated identity extracted from a JWT."""

    subject: str
    role: Role
    tenant_id: str | None
    external_id: str | None = None

    @property
    def is_platform(self) -> bool:
        return self.role == Role.super_admin


async def get_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal:
    """Decode JWT into a Principal. Raises 401 on any failure."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        claims = decode_token(token)
    except JWTError as exc:  # noqa: F841
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if claims.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an access token")
    try:
        role = Role(claims["role"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid role claim"
        ) from exc

    return Principal(
        subject=claims["sub"],
        role=role,
        tenant_id=claims.get("tenant_id"),
        external_id=claims.get("external_id"),
    )


async def get_effective_principal(
    request: Request,
    principal: Principal = Depends(get_principal),
) -> Principal:
    """Allow super_admin to scope requests to a specific tenant via X-Tenant-Id header."""
    if principal.role == Role.super_admin and principal.tenant_id is None:
        tenant_id = request.headers.get("x-tenant-id")
        if tenant_id:
            return Principal(
                subject=principal.subject,
                role=principal.role,
                tenant_id=tenant_id,
                external_id=principal.external_id,
            )
    return principal


async def get_db(principal: Principal = Depends(get_effective_principal)) -> AsyncIterator[AsyncSession]:
    """Tenant-bound DB session for the authenticated principal (RLS-scoped)."""
    tenant_id_ctx.set(principal.tenant_id)
    async with SessionFactory() as session:
        await _set_tenant(session, principal.tenant_id)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db_unscoped() -> AsyncIterator[AsyncSession]:
    """Session with NO tenant bound — for login & platform-level reads."""
    async with SessionFactory() as session:
        await _set_tenant(session, None)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def require_roles(*roles: Role):
    """Dependency factory enforcing the principal holds one of ``roles``."""

    async def _checker(principal: Principal = Depends(get_effective_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this operation",
            )
        return principal

    return _checker


# Convenience guards
require_super_admin = require_roles(Role.super_admin)
require_tenant_admin = require_roles(Role.super_admin, Role.tenant_admin)
require_staff = require_roles(Role.super_admin, Role.tenant_admin, Role.supervisor)


async def get_device_principal(
    x_device_token: str | None = Depends(device_token_scheme),
) -> Principal:
    """Authenticate a kiosk device via the ``X-Device-Token`` header.

    Looks the device up by token hash on an UNSCOPED session (the tenant is
    unknown until the device is found) and returns a kiosk Principal bound to
    the device's tenant. Updates ``last_seen_at`` as a heartbeat.
    """
    if not x_device_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-Device-Token header"
        )
    token_hash = hash_device_token(x_device_token)
    async with SessionFactory() as session:
        await _set_tenant(session, None)  # platform context: search across tenants
        device = (
            await session.execute(select(Device).where(Device.token_hash == token_hash))
        ).scalar_one_or_none()
        if device is None or device.status != DeviceStatus.active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked device token"
            )
        device.last_seen_at = datetime.now(UTC)
        await session.commit()
        tenant_id = device.tenant_id
        device_id = device.id

    tenant_id_ctx.set(tenant_id)
    return Principal(subject=device_id, role=Role.kiosk, tenant_id=tenant_id)


async def get_device_db(
    principal: Principal = Depends(get_device_principal),
) -> AsyncIterator[AsyncSession]:
    """Tenant-bound (RLS-scoped) session for an authenticated kiosk device."""
    tenant_id_ctx.set(principal.tenant_id)
    async with SessionFactory() as session:
        await _set_tenant(session, principal.tenant_id)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
