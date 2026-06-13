"""Core face-recognition attendance loop: enroll -> identify -> record.

Uses the deterministic FakeFaceEngine (FACE_ENGINE=fake): identical image bytes
yield identical embeddings (a match), distinct bytes yield near-orthogonal ones
(no match). This exercises the real domain logic + pgvector 1:N search + RLS
tenant isolation without any ML model.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import SessionFactory, _set_tenant
from app.models import AuditLog, FaceEmbedding

ALICE_FACE = b"face::alice::v1"
STRANGER_FACE = b"face::stranger::v1"


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _onboard(client: AsyncClient, owner_hdr: dict, slug: str) -> dict:
    resp = await client.post(
        "/api/v1/tenants",
        headers=owner_hdr,
        json={
            "name": f"Sekolah {slug}",
            "slug": slug,
            "admin_username": f"admin-{slug}",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin",
        },
    )
    assert resp.status_code == 201, resp.text
    admin = await _token(
        client, username=f"admin-{slug}", password="adminpass123", tenant_slug=slug
    )
    return {"Authorization": f"Bearer {admin}"}


async def _create_user(client: AsyncClient, hdr: dict, full_name: str, username: str) -> str:
    resp = await client.post(
        "/api/v1/users",
        headers=hdr,
        json={"full_name": full_name, "role": "end_user", "username": username},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _grant_consent(client: AsyncClient, hdr: dict, user_id: str) -> None:
    resp = await client.post(
        "/api/v1/consents", headers=hdr, json={"user_id": user_id, "granted": True}
    )
    assert resp.status_code == 201, resp.text


async def _device_token(client: AsyncClient, hdr: dict, name: str = "Kiosk") -> str:
    resp = await client.post("/api/v1/devices", headers=hdr, json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["token"]


@pytest.mark.asyncio
async def test_enroll_requires_consent(client: AsyncClient, super_admin):
    owner = await _token(client, username="owner", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "rec-a")
    user_id = await _create_user(client, hdr, "Bob", "bob")

    # No consent yet -> 403.
    resp = await client.post(
        "/api/v1/enrollment",
        headers=hdr,
        data={"user_id": user_id},
        files={"image": ("b.jpg", b"face::bob", "image/jpeg")},
    )
    assert resp.status_code == 403, resp.text

    # Grant consent -> enrollment succeeds and stores an embedding.
    await _grant_consent(client, hdr, user_id)
    resp = await client.post(
        "/api/v1/enrollment",
        headers=hdr,
        data={"user_id": user_id},
        files={"image": ("b.jpg", b"face::bob", "image/jpeg")},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["enrolled"] is True

    async with SessionFactory() as s:
        await _set_tenant(s, None)
        embs = (await s.execute(select(FaceEmbedding))).scalars().all()
        assert len(embs) == 1
        assert len(embs[0].vector) == 512


@pytest.mark.asyncio
async def test_checkin_recognizes_and_records_with_status(client: AsyncClient, super_admin):
    owner = await _token(client, username="owner", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "rec-b")
    alice = await _create_user(client, hdr, "Alice", "alice")
    await _grant_consent(client, hdr, alice)

    # Enroll Alice.
    assert (
        await client.post(
            "/api/v1/enrollment",
            headers=hdr,
            data={"user_id": alice},
            files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
        )
    ).status_code == 201

    # Default schedule: workday 08:00–16:00, no grace.
    sched = await client.post(
        "/api/v1/schedules",
        headers=hdr,
        json={
            "name": "Reguler",
            "rules": {"workday_start": "08:00", "workday_end": "16:00"},
            "grace_minutes": 0,
            "is_default": True,
        },
    )
    assert sched.status_code == 201, sched.text

    device = await _device_token(client, hdr)
    dhdr = {"X-Device-Token": device}

    # Check-in at 09:00 -> recognized Alice, status LATE.
    resp = await client.post(
        "/api/v1/attendance/checkin",
        headers=dhdr,
        data={"occurred_at": "2026-06-13T09:00:00+00:00"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["full_name"] == "Alice"
    assert data["similarity"] > 0.99  # same bytes -> same embedding
    assert data["attendance"]["status"] == "late"
    assert data["attendance"]["type"] == "check_in"

    # Unknown face -> 404 not recognized.
    miss = await client.post(
        "/api/v1/attendance/checkin",
        headers=dhdr,
        files={"image": ("x.jpg", STRANGER_FACE, "image/jpeg")},
    )
    assert miss.status_code == 404, miss.text

    # Check-out before 16:00 -> early_leave.
    out = await client.post(
        "/api/v1/attendance/checkout",
        headers=dhdr,
        data={"occurred_at": "2026-06-13T12:00:00+00:00", "liveness_score": "0.97"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert out.status_code == 200, out.text
    assert out.json()["data"]["attendance"]["status"] == "early_leave"
    assert out.json()["data"]["attendance"]["liveness_score"] == 0.97

    # Staff can list the tenant's attendance.
    listing = await client.get("/api/v1/attendance", headers=hdr)
    assert listing.status_code == 200
    assert len(listing.json()["data"]) == 2

    async with SessionFactory() as s:
        await _set_tenant(s, None)
        actions = {a.action for a in (await s.execute(select(AuditLog))).scalars()}
        assert "face.enrolled" in actions
        assert "attendance.check_in" in actions
        assert "attendance.check_out" in actions


@pytest.mark.asyncio
async def test_recognition_is_tenant_isolated(client: AsyncClient, super_admin):
    """A kiosk in tenant B must NEVER match a face enrolled in tenant A (RLS)."""
    owner = await _token(client, username="owner", password="ownerpass123")
    ohdr = {"Authorization": f"Bearer {owner}"}

    # Tenant A: enroll Alice.
    a_hdr = await _onboard(client, ohdr, "iso-a")
    alice = await _create_user(client, a_hdr, "Alice", "alice")
    await _grant_consent(client, a_hdr, alice)
    assert (
        await client.post(
            "/api/v1/enrollment",
            headers=a_hdr,
            data={"user_id": alice},
            files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
        )
    ).status_code == 201

    # Tenant B: its own kiosk, no enrolled faces.
    b_hdr = await _onboard(client, ohdr, "iso-b")
    b_device = await _device_token(client, b_hdr, "B-Kiosk")

    # Present Alice's exact face bytes to tenant B's kiosk -> NOT recognized.
    resp = await client.post(
        "/api/v1/attendance/checkin",
        headers={"X-Device-Token": b_device},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert resp.status_code == 404, resp.text
