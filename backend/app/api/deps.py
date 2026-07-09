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
from app.core.security import (
    JWTError,
    decode_token,
    hash_api_key,
    hash_device_token,
    hash_embed_token,
)
from app.db.session import SessionFactory, _set_tenant
from app.models import (
    ApiKey,
    ApiKeyStatus,
    Device,
    DeviceStatus,
    EmbedSession,
    EmbedSessionStatus,
    Role,
)

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
api_key_scheme = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,
    description="Tenant API key (ntr_live_…) for server-to-server integration. "
    "May also be sent as 'Authorization: Bearer ntr_live_…'.",
)
embed_token_scheme = APIKeyHeader(
    name="X-Embed-Token",
    auto_error=False,
    description="One-time embed session token (ntr_embed_…) for the embed flow.",
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


# --------------------------------------------------------------------------- #
# API key auth (server-to-server tenant integration)
# --------------------------------------------------------------------------- #
@dataclass
class ApiPrincipal:
    """Authenticated identity for a tenant API key."""

    key_id: str
    tenant_id: str
    scopes: list[str]
    allowed_origins: list[str]


async def get_api_principal(
    request: Request,
    x_api_key: str | None = Depends(api_key_scheme),
) -> ApiPrincipal:
    """Authenticate a server-to-server request via tenant API key.

    Accepts the key from the ``X-API-Key`` header or ``Authorization: Bearer``.
    Looks the key up by hash on an UNSCOPED session (the tenant is unknown until
    the key is found), rejecting revoked or expired keys. Updates last_used_at.
    """
    raw = x_api_key
    if not raw:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            raw = auth[7:].strip()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key (send X-API-Key or Authorization: Bearer)",
        )

    key_hash = hash_api_key(raw)
    async with SessionFactory() as session:
        await _set_tenant(session, None)  # platform context: search across tenants
        key = (
            await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
        ).scalar_one_or_none()
        if key is None or key.status != ApiKeyStatus.active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key"
            )
        if key.expires_at is not None and key.expires_at < datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="API key has expired"
            )
        key.last_used_at = datetime.now(UTC)
        await session.commit()
        tenant_id = key.tenant_id
        key_id = key.id
        scopes = list(key.scopes or [])
        allowed_origins = list(key.allowed_origins or [])

    tenant_id_ctx.set(tenant_id)
    return ApiPrincipal(
        key_id=key_id, tenant_id=tenant_id, scopes=scopes, allowed_origins=allowed_origins
    )


async def get_api_db(
    principal: ApiPrincipal = Depends(get_api_principal),
) -> AsyncIterator[AsyncSession]:
    """Tenant-bound (RLS-scoped) session for an authenticated API key."""
    tenant_id_ctx.set(principal.tenant_id)
    async with SessionFactory() as session:
        await _set_tenant(session, principal.tenant_id)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def require_scope(scope: str):
    """Dependency factory enforcing the API key carries ``scope``."""

    async def _checker(
        principal: ApiPrincipal = Depends(get_api_principal),
    ) -> ApiPrincipal:
        if scope not in principal.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key missing required scope: {scope}",
            )
        return principal

    return _checker


# --------------------------------------------------------------------------- #
# Embed session auth (render netra flows inside a client app)
# --------------------------------------------------------------------------- #
@dataclass
class EmbedPrincipal:
    """Authenticated identity for a one-time embed session."""

    session_id: str
    tenant_id: str
    purpose: str
    external_id: str | None
    full_name: str | None
    user_id: str | None
    is_minor: bool
    return_origin: str


async def _embed_principal_from_token(token: str | None) -> EmbedPrincipal:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing embed token"
        )
    token_hash = hash_embed_token(token)
    async with SessionFactory() as session:
        await _set_tenant(session, None)  # platform context: search across tenants
        embed = (
            await session.execute(
                select(EmbedSession).where(EmbedSession.token_hash == token_hash)
            )
        ).scalar_one_or_none()
        if embed is None or embed.status != EmbedSessionStatus.pending:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or used embed session"
            )
        if embed.expires_at < datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Embed session expired"
            )
        principal = EmbedPrincipal(
            session_id=embed.id,
            tenant_id=embed.tenant_id,
            purpose=embed.purpose.value,
            external_id=embed.external_id,
            full_name=embed.full_name,
            user_id=embed.user_id,
            is_minor=embed.is_minor,
            return_origin=embed.return_origin,
        )
    tenant_id_ctx.set(principal.tenant_id)
    return principal


async def get_embed_principal(
    x_embed_token: str | None = Depends(embed_token_scheme),
) -> EmbedPrincipal:
    """Authenticate an embed API request via the ``X-Embed-Token`` header."""
    return await _embed_principal_from_token(x_embed_token)


async def get_embed_db(
    principal: EmbedPrincipal = Depends(get_embed_principal),
) -> AsyncIterator[AsyncSession]:
    """Tenant-bound (RLS-scoped) session for an authenticated embed session."""
    tenant_id_ctx.set(principal.tenant_id)
    async with SessionFactory() as session:
        await _set_tenant(session, principal.tenant_id)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
