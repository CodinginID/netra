"""The 30-day purge must run as a platform-level job, across every tenant.

Under fail-closed RLS a session with no tenant bound matches zero rows, so a
maintenance job that forgets the platform grant deletes nothing at all — and
reports success while doing it. These tests pin the grant in place.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.db.session import SessionFactory, _set_tenant
from app.models import Role, Tenant, User
from app.services.soft_delete import purge_expired


async def _seed_deleted_user(tenant_slug: str, name: str, deleted_days_ago: int) -> str:
    """Create a tenant with one user soft-deleted `deleted_days_ago` days ago."""
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        tenant = Tenant(name=f"Sekolah {tenant_slug}", slug=tenant_slug)
        s.add(tenant)
        await s.flush()
        user = User(
            tenant_id=tenant.id,
            full_name=name,
            role=Role.end_user,
            deleted_at=datetime.now(UTC) - timedelta(days=deleted_days_ago),
        )
        s.add(user)
        await s.flush()
        user_id = user.id
        await s.commit()
    return user_id


async def _user_exists(user_id: str) -> bool:
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        row = (await s.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        return row is not None


@pytest.mark.asyncio
async def test_purge_removes_expired_rows_across_every_tenant():
    """The purge is platform-level: one run must cover all tenants, not none."""
    old_a = await _seed_deleted_user("purge-a", "Old Alice", deleted_days_ago=40)
    old_b = await _seed_deleted_user("purge-b", "Old Bob", deleted_days_ago=40)

    counts = await purge_expired(days=30)

    assert counts["users"] == 2, f"expected both tenants purged, got {counts}"
    assert not await _user_exists(old_a)
    assert not await _user_exists(old_b)


@pytest.mark.asyncio
async def test_purge_keeps_rows_inside_the_retention_window():
    """Only rows past the retention cutoff go — the window is the whole point."""
    recent = await _seed_deleted_user("purge-recent", "Recent Rina", deleted_days_ago=5)

    counts = await purge_expired(days=30)

    assert counts["users"] == 0, f"purge took a row still inside the window: {counts}"
    assert await _user_exists(recent)
