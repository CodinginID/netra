"""POST /tenants/{id}/reset — super admin wipes chosen data categories of one
tenant; the tenant, its admin and every other tenant stay intact."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import SessionFactory, _set_tenant
from app.models import AttendanceRecord, AuditLog, Device, FaceEmbedding, Role, Tenant, User
from tests.test_recognition import _create_user, _grant_consent, _token

FACE = b"face::reset::alice"


async def _owner_hdr(client: AsyncClient) -> dict:
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    return {"Authorization": f"Bearer {owner}"}


async def _seed_tenant(client: AsyncClient, ohdr: dict, slug: str) -> str:
    """Tenant with admin + one enrolled end user + one kiosk device + one punch."""
    resp = await client.post(
        "/api/v1/tenants",
        headers=ohdr,
        json={
            "name": slug,
            "slug": slug,
            "admin_email": f"admin-{slug}@netra.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin",
        },
    )
    assert resp.status_code == 201, resp.text
    tenant_id = resp.json()["data"]["id"]
    admin = await _token(client, email=f"admin-{slug}@netra.app", password="adminpass123")
    hdr = {"Authorization": f"Bearer {admin}"}

    alice = await _create_user(client, hdr, "Alice", f"alice-{slug}")
    await _grant_consent(client, hdr, alice)
    enroll = await client.post(
        "/api/v1/enrollment",
        headers=hdr,
        data={"user_id": alice},
        files={"image": ("a.jpg", FACE, "image/jpeg")},
    )
    assert enroll.status_code == 201, enroll.text
    dev = await client.post("/api/v1/devices", headers=hdr, json={"name": "Kiosk"})
    assert dev.status_code == 201, dev.text
    punch = await client.post(
        "/api/v1/attendance/checkin",
        headers={"X-Device-Token": dev.json()["data"]["token"]},
        files={"image": ("a.jpg", FACE, "image/jpeg")},
    )
    assert punch.status_code == 200, punch.text
    return tenant_id


async def _count(model, tenant_id: str) -> int:
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        stmt = select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
        return (await s.execute(stmt)).scalar_one()


async def _reset(client: AsyncClient, hdr: dict, tenant_id: str, slug: str, cats: list[str]):
    return await client.post(
        f"/api/v1/tenants/{tenant_id}/reset",
        headers=hdr,
        json={"categories": cats, "confirm_slug": slug},
    )


@pytest.mark.asyncio
async def test_reset_attendance_only_keeps_everything_else(client: AsyncClient, super_admin):
    ohdr = await _owner_hdr(client)
    tid = await _seed_tenant(client, ohdr, "rst-a")

    resp = await _reset(client, ohdr, tid, "rst-a", ["attendance"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["removed"] == {"attendance": 1}

    assert await _count(AttendanceRecord, tid) == 0
    assert await _count(FaceEmbedding, tid) == 1
    assert await _count(Device, tid) == 1
    assert await _count(User, tid) == 2


@pytest.mark.asyncio
async def test_reset_all_categories_keeps_tenant_and_admin(client: AsyncClient, super_admin):
    ohdr = await _owner_hdr(client)
    tid = await _seed_tenant(client, ohdr, "rst-b")
    other = await _seed_tenant(client, ohdr, "rst-c")

    cats = ["attendance", "faces", "users", "devices"]
    resp = await _reset(client, ohdr, tid, "rst-b", cats)
    assert resp.status_code == 200, resp.text

    for model in (AttendanceRecord, FaceEmbedding, Device):
        assert await _count(model, tid) == 0
        assert await _count(model, other) == 1  # other tenant untouched
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        users = (await s.execute(select(User).where(User.tenant_id == tid))).scalars().all()
        assert [u.role for u in users] == [Role.tenant_admin]
        assert all(u.enrolled is False for u in users)
        assert (await s.get(Tenant, tid)) is not None
        audit = await s.execute(select(AuditLog).where(AuditLog.action == "tenant.reset"))
        assert audit.scalar_one().detail["categories"] == sorted(cats)
    # Admin can still sign in after the reset.
    await _token(client, email="admin-rst-b@netra.app", password="adminpass123")


@pytest.mark.asyncio
async def test_reset_requires_matching_slug_and_a_category(client: AsyncClient, super_admin):
    ohdr = await _owner_hdr(client)
    tid = await _seed_tenant(client, ohdr, "rst-d")

    wrong = await _reset(client, ohdr, tid, "not-the-slug", ["attendance"])
    assert wrong.status_code == 400, wrong.text
    empty = await _reset(client, ohdr, tid, "rst-d", [])
    assert empty.status_code == 422, empty.text
    missing = await _reset(client, ohdr, "00000000-0000-0000-0000-000000000000", "x", ["faces"])
    assert missing.status_code == 404, missing.text
    assert await _count(AttendanceRecord, tid) == 1


@pytest.mark.asyncio
async def test_reset_is_super_admin_only(client: AsyncClient, super_admin):
    ohdr = await _owner_hdr(client)
    tid = await _seed_tenant(client, ohdr, "rst-e")
    admin = await _token(client, email="admin-rst-e@netra.app", password="adminpass123")

    resp = await _reset(client, {"Authorization": f"Bearer {admin}"}, tid, "rst-e", ["faces"])
    assert resp.status_code == 403, resp.text
    assert await _count(FaceEmbedding, tid) == 1
