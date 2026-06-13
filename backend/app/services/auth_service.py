"""Authentication service: credential verification + token issuance."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
)
from app.models import Role, Tenant, TenantStatus, User
from app.schemas import TokenResponse


class AuthError(Exception):
    """Raised on failed authentication."""


async def authenticate(
    session: AsyncSession, *, username: str, password: str, tenant_slug: str | None
) -> TokenResponse:
    """Authenticate against the internal identity store.

    Super admins log in without a tenant. Tenant users must supply tenant_slug.
    Runs on an UNSCOPED session (login happens before tenant context exists).
    """
    tenant_id: str | None = None

    if tenant_slug:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.slug == tenant_slug))
        ).scalar_one_or_none()
        if tenant is None:
            raise AuthError("Invalid credentials")
        if tenant.status != TenantStatus.active:
            raise AuthError("Tenant is suspended")
        tenant_id = tenant.id
        stmt = select(User).where(User.tenant_id == tenant_id, User.username == username)
    else:
        # platform-level login: super admin only (tenant_id IS NULL)
        stmt = select(User).where(User.username == username, User.tenant_id.is_(None))

    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None or not user.password_hash or not user.is_active:
        raise AuthError("Invalid credentials")
    if not verify_password(password, user.password_hash):
        raise AuthError("Invalid credentials")

    if tenant_slug is None and user.role != Role.super_admin:
        raise AuthError("Invalid credentials")

    access = create_access_token(
        subject=user.id,
        tenant_id=user.tenant_id,
        role=user.role.value,
        external_id=user.external_id,
    )
    refresh = create_refresh_token(subject=user.id, tenant_id=user.tenant_id)
    return TokenResponse(access_token=access, refresh_token=refresh, role=user.role)
