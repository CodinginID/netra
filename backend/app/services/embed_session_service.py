"""Embed session lifecycle: mint, lookup-by-hash, consume.

Tokens are opaque + table-backed (single-use, revocable, auditable). The
plaintext lives only in the returned embed URL; only the hash is stored.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_embed_token, hash_embed_token
from app.models import EmbedPurpose, EmbedSession, EmbedSessionStatus


def normalize_origin(origin: str) -> str:
    """Canonical form for comparison: trimmed, no trailing slash."""
    return origin.strip().rstrip("/")


def origin_allowed(allowed: list[str], origin: str) -> bool:
    """Exact (normalized) match of ``origin`` against the tenant allowlist."""
    target = normalize_origin(origin)
    return any(normalize_origin(a) == target for a in (allowed or []))


async def create(
    session: AsyncSession,
    tenant_id: str,
    *,
    external_id: str,
    full_name: str | None,
    return_origin: str,
    is_minor: bool,
    ttl_minutes: int,
    purpose: EmbedPurpose = EmbedPurpose.enroll,
) -> tuple[EmbedSession, str]:
    """Mint a session. Returns (EmbedSession, plaintext_token) — token shown once."""
    token = generate_embed_token()
    embed = EmbedSession(
        tenant_id=tenant_id,
        token_hash=hash_embed_token(token),
        purpose=purpose,
        external_id=external_id,
        full_name=full_name,
        is_minor=is_minor,
        return_origin=normalize_origin(return_origin),
        status=EmbedSessionStatus.pending,
        expires_at=datetime.now(UTC) + timedelta(minutes=ttl_minutes),
    )
    session.add(embed)
    await session.flush()
    return embed, token


async def lookup_active(session: AsyncSession, token: str) -> EmbedSession | None:
    """Return the session for ``token`` only if pending and not expired."""
    embed = (
        await session.execute(
            select(EmbedSession).where(EmbedSession.token_hash == hash_embed_token(token))
        )
    ).scalar_one_or_none()
    if embed is None or embed.status != EmbedSessionStatus.pending:
        return None
    if embed.expires_at < datetime.now(UTC):
        return None
    return embed


async def consume(session: AsyncSession, embed: EmbedSession) -> None:
    embed.status = EmbedSessionStatus.consumed
    embed.consumed_at = datetime.now(UTC)
    await session.flush()
