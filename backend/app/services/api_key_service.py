"""Tenant API key lifecycle: create, list, rotate, revoke, delete.

Keys authenticate a tenant's own backend (server-to-server) so it can pull data
from netra. The plaintext key is returned ONCE by ``create`` / ``rotate``; only
its hash is stored. All operations run on a tenant-bound (RLS-scoped) session,
so a tenant can only ever see/touch its own keys.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    api_key_display_prefix,
    generate_api_key,
    hash_api_key,
)
from app.models import ApiKey, ApiKeyStatus


async def create(
    session: AsyncSession,
    tenant_id: str,
    *,
    name: str,
    scopes: list[str],
    expires_in_days: int | None = None,
    allowed_origins: list[str] | None = None,
) -> tuple[ApiKey, str]:
    """Create a key. Returns (ApiKey, plaintext_key) — surface the key once."""
    plaintext = generate_api_key()
    expires_at = (
        datetime.now(UTC) + timedelta(days=expires_in_days) if expires_in_days else None
    )
    key = ApiKey(
        tenant_id=tenant_id,
        name=name,
        prefix=api_key_display_prefix(plaintext),
        key_hash=hash_api_key(plaintext),
        scopes=scopes,
        allowed_origins=allowed_origins or [],
        status=ApiKeyStatus.active,
        expires_at=expires_at,
    )
    session.add(key)
    await session.flush()
    return key, plaintext


async def list_keys(session: AsyncSession) -> list[ApiKey]:
    result = await session.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    return list(result.scalars())


async def get(session: AsyncSession, key_id: str) -> ApiKey | None:
    return (
        await session.execute(select(ApiKey).where(ApiKey.id == key_id))
    ).scalar_one_or_none()


async def rotate(session: AsyncSession, key: ApiKey) -> str:
    """Issue a fresh secret for an existing key. Old secret stops working at once."""
    plaintext = generate_api_key()
    key.prefix = api_key_display_prefix(plaintext)
    key.key_hash = hash_api_key(plaintext)
    key.status = ApiKeyStatus.active
    await session.flush()
    return plaintext


async def update_origins(session: AsyncSession, key: ApiKey, allowed_origins: list[str]) -> ApiKey:
    key.allowed_origins = allowed_origins
    await session.flush()
    return key


async def revoke(session: AsyncSession, key: ApiKey) -> ApiKey:
    key.status = ApiKeyStatus.revoked
    await session.flush()
    return key


async def delete(session: AsyncSession, key: ApiKey) -> None:
    await session.delete(key)
    await session.flush()
