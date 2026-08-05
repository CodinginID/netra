"""The critical test: Row-Level Security must isolate tenants at the DB layer.

Even with a deliberately unfiltered query, a tenant-bound session must only
ever see its own rows — and a session with NO tenant bound must see none at
all, rather than every tenant's rows merged together.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import SessionFactory, _set_tenant
from app.models import Role, Tenant, User


@pytest.mark.asyncio
async def test_rls_blocks_cross_tenant_reads():
    # Arrange: two tenants, each with one user — created in platform context.
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
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
        await _set_tenant(s, None, platform=True)
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


async def _seed_two_tenants() -> tuple[str, str]:
    """Two tenants, one user each. Returns their ids."""
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        t_a = Tenant(name="Sekolah A", slug="sekolah-a")
        t_b = Tenant(name="Sekolah B", slug="sekolah-b")
        s.add_all([t_a, t_b])
        await s.flush()
        s.add(User(tenant_id=t_a.id, full_name="Alice", role=Role.end_user))
        s.add(User(tenant_id=t_b.id, full_name="Bob", role=Role.end_user))
        await s.commit()
        return t_a.id, t_b.id


@pytest.mark.asyncio
async def test_unbound_session_sees_no_tenant_rows():
    """RLS must fail CLOSED: no tenant bound => no rows, not every tenant's rows.

    Regression test for the cross-tenant leak: the original policies treated an
    empty ``app.current_tenant`` as "platform context, full access", so any
    request that reached the DB without a tenant (a super admin missing the
    X-Tenant-Id header, a frontend race) silently received every tenant's data.
    """
    await _seed_two_tenants()

    async with SessionFactory() as s:
        await _set_tenant(s, None)  # no tenant, no platform grant
        rows = list((await s.execute(select(User))).scalars())
        assert rows == []


@pytest.mark.asyncio
async def test_unbound_session_cannot_write_tenant_rows():
    """Fail-closed applies to writes too — no tenant bound means no INSERT."""
    from sqlalchemy.exc import DatabaseError

    a_id, _ = await _seed_two_tenants()

    with pytest.raises(DatabaseError):
        async with SessionFactory() as s:
            await _set_tenant(s, None)
            s.add(User(tenant_id=a_id, full_name="Nobody", role=Role.end_user))
            await s.commit()


@pytest.mark.asyncio
async def test_platform_context_is_an_explicit_opt_in():
    """Cross-tenant reads require the explicit platform grant."""
    await _seed_two_tenants()

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        names = {u.full_name for u in (await s.execute(select(User))).scalars()}
        assert names == {"Alice", "Bob"}


@pytest.mark.asyncio
async def test_platform_grant_does_not_survive_the_session():
    """A pooled connection must never carry a stale platform grant.

    ``_set_tenant`` writes both variables every time, so binding a tenant on a
    connection that previously held the platform grant revokes it.
    """
    a_id, _ = await _seed_two_tenants()

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        assert len(list((await s.execute(select(User))).scalars())) == 2
        # Same session, now bound to a tenant: the grant must be gone.
        await _set_tenant(s, a_id)
        rows = list((await s.execute(select(User))).scalars())
        assert [u.full_name for u in rows] == ["Alice"]


# --------------------------------------------------------------------------- #
# API layer: the tenant a request acts on must be unambiguous.
# --------------------------------------------------------------------------- #
async def _login(client: AsyncClient, email: str, password: str) -> str:
    # Unique X-Forwarded-For per login so these tests never trip the per-IP
    # login rate limiter (10/min) when the whole suite runs in one process.
    ip = f"10.88.{abs(hash(email)) % 250}.{abs(hash(email) >> 8) % 250}"
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"x-forwarded-for": ip},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _onboard_tenant(client: AsyncClient, owner_token: str, slug: str) -> str:
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": slug,
            "slug": slug,
            "admin_email": f"admin@{slug}.app",
            "admin_password": "adminpass123",
            "admin_full_name": f"Admin {slug}",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


@pytest.mark.asyncio
async def test_super_admin_tenant_scoping_over_http(client: AsyncClient, super_admin):
    """A super admin's tenant scope comes from X-Tenant-Id — and is required.

    Without the header a tenant-scoped endpoint must refuse the request rather
    than merge every tenant's rows into one response.
    """
    owner = await _login(client, "owner@netra.app", "ownerpass123")
    auth = {"Authorization": f"Bearer {owner}"}

    a_id = await _onboard_tenant(client, owner, "leak-a")
    await _onboard_tenant(client, owner, "leak-b")

    # No tenant context -> rejected, not silently merged.
    resp = await client.get("/api/v1/users", headers=auth)
    assert resp.status_code == 400, resp.text

    # Scoped to tenant A -> only tenant A's admin.
    resp = await client.get("/api/v1/users", headers={**auth, "X-Tenant-Id": a_id})
    assert resp.status_code == 200, resp.text
    emails = [u["email"] for u in resp.json()["data"]["items"]]
    assert emails == ["admin@leak-a.app"]

    # Explicit platform scope -> both tenants' admins, by request.
    resp = await client.get("/api/v1/users", headers={**auth, "X-Tenant-Id": "*"})
    assert resp.status_code == 200, resp.text
    emails = {u["email"] for u in resp.json()["data"]["items"]}
    assert {"admin@leak-a.app", "admin@leak-b.app"} <= emails


@pytest.mark.asyncio
async def test_tenant_admin_cannot_widen_scope_with_a_header(client: AsyncClient, super_admin):
    """X-Tenant-Id is a super-admin capability — a tenant admin stays pinned."""
    owner = await _login(client, "owner@netra.app", "ownerpass123")
    a_id = await _onboard_tenant(client, owner, "pinned-a")
    b_id = await _onboard_tenant(client, owner, "pinned-b")

    token = await _login(client, "admin@pinned-a.app", "adminpass123")
    admin = {"Authorization": f"Bearer {token}"}

    for spoof in (b_id, "*"):
        resp = await client.get("/api/v1/users", headers={**admin, "X-Tenant-Id": spoof})
        assert resp.status_code == 200, resp.text
        emails = [u["email"] for u in resp.json()["data"]["items"]]
        assert emails == ["admin@pinned-a.app"], f"scope widened via X-Tenant-Id: {spoof}"

    assert a_id != b_id


# --------------------------------------------------------------------------- #
# Structural guards: coverage must not depend on anyone remembering.
#
# The tests above prove isolation works for `users`. These prove no tenant table
# can quietly opt out — a new migration that adds a tenant_id column without the
# matching policy fails here instead of leaking in production.
# --------------------------------------------------------------------------- #
_TENANT_TABLES_SQL = """
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = c.relname
        AND col.column_name = 'tenant_id'
  )
ORDER BY c.relname
"""


@pytest.mark.asyncio
async def test_every_table_with_tenant_id_has_rls_enabled_and_forced():
    """Any table carrying tenant_id must have RLS enabled AND forced.

    FORCE matters as much as ENABLE: without it the table owner bypasses the
    policy, so isolation would hold for the app role but vanish for anyone
    connecting as the owner (migrations, psql, an ops script).
    """
    from sqlalchemy import text

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        rows = list(await s.execute(text(_TENANT_TABLES_SQL)))

    assert rows, "found no tables with a tenant_id column — query is wrong"

    unprotected = [r[0] for r in rows if not r[1]]
    unforced = [r[0] for r in rows if not r[2]]
    assert unprotected == [], f"tenant tables without RLS enabled: {unprotected}"
    assert unforced == [], f"tenant tables without FORCE RLS: {unforced}"


@pytest.mark.asyncio
async def test_every_tenant_table_policy_is_fail_closed():
    """Each tenant table's policy must be the fail-closed generation.

    The discriminator is ``app.platform_context``: the old fail-open predicate
    treated an unbound tenant as full access and never referenced that grant, so
    its absence means a table is still running the leaky policy.
    """
    from sqlalchemy import text

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        tables = [r[0] for r in await s.execute(text(_TENANT_TABLES_SQL))]
        policies = {
            (r[0], r[1]): r[2]
            for r in await s.execute(
                text(
                    "SELECT tablename, policyname, qual FROM pg_policies "
                    "WHERE schemaname = 'public'"
                )
            )
        }

    by_table: dict[str, list[str]] = {}
    for (table, _policy), qual in policies.items():
        by_table.setdefault(table, []).append(qual or "")

    missing = [t for t in tables if t not in by_table]
    assert missing == [], f"tenant tables with no RLS policy at all: {missing}"

    fail_open = [
        t
        for t in tables
        if not any("app.platform_context" in q for q in by_table[t])
    ]
    assert fail_open == [], (
        f"tenant tables still on a fail-open policy (no app.platform_context "
        f"grant in USING): {fail_open}"
    )


@pytest.mark.asyncio
async def test_app_role_cannot_bypass_rls():
    """The role the app connects as must not be able to ignore policies.

    Pointing DATABASE_URL at a superuser (or a BYPASSRLS role) silently voids
    every policy above while leaving the app working, so assert it directly.
    """
    from sqlalchemy import text

    async with SessionFactory() as s:
        row = (
            await s.execute(
                text(
                    "SELECT current_user, rolsuper, rolbypassrls "
                    "FROM pg_roles WHERE rolname = current_user"
                )
            )
        ).one()

    user, is_super, can_bypass = row
    assert not is_super, f"app connects as superuser '{user}' — RLS does not apply"
    assert not can_bypass, f"app role '{user}' has BYPASSRLS — RLS does not apply"
