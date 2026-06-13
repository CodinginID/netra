"""The critical test: Row-Level Security must isolate tenants at the DB layer.

Even with a deliberately unfiltered query, a tenant-bound session must only
ever see its own rows.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.session import SessionFactory, _set_tenant
from app.models import Role, Tenant, User


@pytest.mark.asyncio
async def test_rls_blocks_cross_tenant_reads():
    # Arrange: two tenants, each with one user — created in platform context.
    async with SessionFactory() as s:
        await _set_tenant(s, None)
        t_a = Tenant(name="Sekolah A", slug="sekolah-a")
        t_b = Tenant(name="Sekolah B", slug="sekolah-b")
        s.add_all([t_a, t_b])
        await s.flush()
        s.add(User(tenant_id=t_a.id, full_name="Alice", role=Role.end_user))
        s.add(User(tenant_id=t_b.id, full_name="Bob", role=Role.end_user))
        await s.commit()
        a_id, b_id = t_a.id, t_b.id

    # Act + Assert: session bound to tenant A sees ONLY tenant A users,
    # despite the query having NO WHERE clause on tenant_id.
    async with SessionFactory() as s:
        await _set_tenant(s, a_id)
        rows = list((await s.execute(select(User))).scalars())
        assert len(rows) == 1
        assert rows[0].full_name == "Alice"
        assert all(u.tenant_id == a_id for u in rows)

    # And tenant B sees only Bob.
    async with SessionFactory() as s:
        await _set_tenant(s, b_id)
        rows = list((await s.execute(select(User))).scalars())
        assert len(rows) == 1
        assert rows[0].full_name == "Bob"


@pytest.mark.asyncio
async def test_rls_blocks_cross_tenant_writes():
    """A tenant-bound session cannot INSERT rows for a different tenant."""
    from sqlalchemy.exc import ProgrammingError

    async with SessionFactory() as s:
        await _set_tenant(s, None)
        t_a = Tenant(name="Sekolah A", slug="sekolah-a")
        t_b = Tenant(name="Sekolah B", slug="sekolah-b")
        s.add_all([t_a, t_b])
        await s.commit()
        a_id, b_id = t_a.id, t_b.id

    # Bound to tenant A, try to insert a user for tenant B -> RLS WITH CHECK rejects.
    with pytest.raises((ProgrammingError, Exception)):
        async with SessionFactory() as s:
            await _set_tenant(s, a_id)
            s.add(User(tenant_id=b_id, full_name="Mallory", role=Role.end_user))
            await s.commit()
