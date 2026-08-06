"""End-user lookup + provisioning, shared by the users router and the embed flow.

Centralizes the rules around external_id (encrypted at rest, looked up via the
deterministic external_id_hash) so callers never hand-roll it.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.types import external_id_digest
from app.models import Role, User


async def find_by_external_id(session: AsyncSession, external_id: str) -> User | None:
    """Find a (non-deleted) user in the current tenant scope by external_id."""
    digest = external_id_digest(external_id)
    return (
        await session.execute(
            select(User).where(User.external_id_hash == digest, User.deleted_at.is_(None))
        )
    ).scalar_one_or_none()


async def upsert_end_user(
    session: AsyncSession,
    tenant_id: str,
    *,
    external_id: str,
    full_name: str,
) -> tuple[User, bool]:
    """Create-or-update an end-user keyed by ``external_id``; returns (user, created).

    Matches INCLUDING soft-deleted rows — uq_user_tenant_external covers them,
    so inserting a fresh row would violate the constraint. A deleted match is
    revived instead (the client re-syncing an employee means they are active).
    Existing rows only get their ``full_name`` refreshed; role is never touched.
    """
    digest = external_id_digest(external_id)
    existing = (
        await session.execute(select(User).where(User.external_id_hash == digest))
    ).scalar_one_or_none()
    if existing is not None:
        existing.deleted_at = None
        if existing.full_name != full_name:
            existing.full_name = full_name
        return existing, False
    user = User(
        tenant_id=tenant_id,
        full_name=full_name,
        role=Role.end_user,
        external_id=external_id,  # @validates keeps external_id_hash in sync
    )
    session.add(user)
    await session.flush()
    return user, True


async def get_or_provision_end_user(
    session: AsyncSession,
    tenant_id: str,
    *,
    external_id: str,
    full_name: str | None,
) -> User:
    """Return the existing end-user for ``external_id`` or create one.

    Raises ValueError when the user is absent and ``full_name`` is missing —
    we cannot create a meaningful record without a name.
    """
    existing = await find_by_external_id(session, external_id)
    if existing is not None:
        return existing
    if not full_name:
        raise ValueError("full_name is required to create a new user")
    user = User(
        tenant_id=tenant_id,
        full_name=full_name,
        role=Role.end_user,
        external_id=external_id,  # @validates keeps external_id_hash in sync
    )
    session.add(user)
    await session.flush()
    return user
