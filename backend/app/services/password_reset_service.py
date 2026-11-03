"""Admin-initiated password reset for staff accounts (forgotten password).

The caller's DB session is tenant-scoped (RLS), so a user from another tenant —
or a platform super admin, who has no tenant — is simply not found here.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Role, User

# Only accounts that log in with a password can have one reset. End users and
# kiosk devices never authenticate by password.
RESETTABLE_ROLES = frozenset({Role.tenant_admin, Role.supervisor})


class ResetNotFound(Exception):
    """Target user does not exist (in this tenant) or is deleted."""


class ResetNotAllowed(Exception):
    """Target exists but its password may not be reset by this route."""


async def reset_password(
    session: AsyncSession, *, user_id: str, actor_id: str, new_password: str
) -> User:
    """Set a new password for a staff user in the caller's tenant."""
    if user_id == actor_id:
        raise ResetNotAllowed("Use change-password to change your own password")
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise ResetNotFound("User not found")
    if user.role not in RESETTABLE_ROLES:
        raise ResetNotAllowed("Only tenant admin and supervisor passwords can be reset")
    user.password_hash = hash_password(new_password)
    await session.flush()
    return user
