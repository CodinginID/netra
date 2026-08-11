"""End-user lookup + provisioning, shared by the users router and the embed flow.

Centralizes the rules around external_id (encrypted at rest, looked up via the
deterministic external_id_hash) so callers never hand-roll it.
"""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.types import external_id_digest
from app.models import Role, User


class AmbiguousRevival(Exception):
    """More than one deleted user holds the identity being re-created."""


async def find_deleted_by_identity(
    session: AsyncSession,
    tenant_id: str,
    *,
    external_id: str | None = None,
    username: str | None = None,
    email: str | None = None,
) -> User | None:
    """Find the soft-deleted user in ``tenant_id`` holding any of these identifiers.

    Soft delete only stamps ``deleted_at``; the row keeps its external_id,
    username and email, and the unique constraints keep covering them. So a
    deleted person is invisible in every listing yet still owns their NIS/NIM,
    username and email — re-adding them fails with a duplicate error that points
    at a record the admin cannot see. Callers use this to revive that row
    instead (see ``upsert_end_user``, which has always done so for the roster
    sync API).

    Returns None when no deleted row claims any of the identifiers. Raises
    ``AmbiguousRevival`` when several different deleted rows do — reviving one
    would silently merge two people's records, so the caller must refuse.
    """
    predicates = []
    if external_id:
        predicates.append(User.external_id_hash == external_id_digest(external_id))
    if username:
        predicates.append(User.username == username)
    if email:
        predicates.append(User.email == email.strip().lower())
    if not predicates:
        return None

    matches = list(
        (
            await session.execute(
                select(User).where(
                    User.tenant_id == tenant_id,
                    User.deleted_at.isnot(None),
                    or_(*predicates),
                )
            )
        ).scalars()
    )
    if not matches:
        return None
    if len({u.id for u in matches}) > 1:
        raise AmbiguousRevival
    return matches[0]


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
