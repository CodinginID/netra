"""Authentication service: credential verification + token issuance."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import Tenant, TenantStatus, User
from app.schemas import TokenResponse


class AuthError(Exception):
    """Raised on failed authentication."""


async def _ensure_tenant_active(session: AsyncSession, tenant_id: str | None) -> None:
    """Block access into a suspended tenant (super admins have tenant_id=None)."""
    if tenant_id is None:
        return
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None or tenant.status != TenantStatus.active:
        raise AuthError("Tenant is suspended")


def _issue_tokens(user: User) -> TokenResponse:
    """Mint a fresh access + refresh pair for an authenticated user."""
    access = create_access_token(
        subject=user.id,
        tenant_id=user.tenant_id,
        role=user.role.value,
        external_id=user.external_id,
    )
    refresh = create_refresh_token(subject=user.id, tenant_id=user.tenant_id)
    return TokenResponse(access_token=access, refresh_token=refresh, role=user.role)


async def authenticate(
    session: AsyncSession, *, email: str, password: str
) -> TokenResponse:
    """Authenticate staff by their GLOBAL email identifier.

    Email is unique across all tenants, so it identifies the user (and thus the
    tenant) on its own — no slug needed. The tenant_id is read off the matched
    user and baked into the JWT. Runs on an UNSCOPED session (login happens
    before tenant context exists).
    """
    normalized_email = email.strip().lower()
    user = (
        await session.execute(select(User).where(User.email == normalized_email))
    ).scalar_one_or_none()
    if user is None or not user.password_hash or not user.is_active:
        raise AuthError("Invalid credentials")
    if not verify_password(password, user.password_hash):
        raise AuthError("Invalid credentials")

    await _ensure_tenant_active(session, user.tenant_id)
    return _issue_tokens(user)


async def refresh_tokens(session: AsyncSession, *, refresh_token: str) -> TokenResponse:
    """Exchange a valid refresh token for a fresh access + refresh pair.

    Re-loads the user so revoked/deactivated accounts and suspended tenants are
    rejected immediately, and the new access token reflects current role/claims.
    """
    try:
        claims = decode_token(refresh_token)
    except JWTError as exc:
        raise AuthError("Invalid or expired refresh token") from exc
    if claims.get("type") != "refresh":
        raise AuthError("Not a refresh token")

    user = await session.get(User, claims.get("sub", ""))
    if user is None or not user.is_active:
        raise AuthError("Invalid or expired refresh token")

    await _ensure_tenant_active(session, user.tenant_id)
    return _issue_tokens(user)


async def change_password(
    session: AsyncSession, *, user_id: str, old_password: str, new_password: str
) -> None:
    """Change a user's own password after verifying the current one."""
    user = await session.get(User, user_id)
    if user is None or not user.password_hash:
        raise AuthError("Invalid credentials")
    if not verify_password(old_password, user.password_hash):
        raise AuthError("Current password is incorrect")
    user.password_hash = hash_password(new_password)
    await session.flush()
