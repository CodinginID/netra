"""Core face-recognition attendance loop: enroll -> identify -> record.

Uses the deterministic FakeFaceEngine (FACE_ENGINE=fake): identical image bytes
yield identical embeddings (a match), distinct bytes yield near-orthogonal ones
(no match). This exercises the real domain logic + pgvector 1:N search + RLS
tenant isolation without any ML model.
"""

from __future__ import annotations

import asyncio
import time

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import SessionFactory, _set_tenant
from app.models import AuditLog, FaceEmbedding, Role, Tenant, User
from app.services import recognition_service

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
            "admin_email": f"admin-{slug}@netra.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin",
        },
    )
    assert resp.status_code == 201, resp.text
    admin = await _token(
        client, email=f"admin-{slug}@netra.app", password="adminpass123"
    )
    return {"Authorization": f"Bearer {admin}"}


async def _create_user(client: AsyncClient, hdr: dict, full_name: str, external_id: str) -> str:
    resp = await client.post(
        "/api/v1/users",
        headers=hdr,
        json={"full_name": full_name, "role": "end_user", "external_id": external_id},
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
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
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
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
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
        data={"occurred_at": "2026-06-13T12:00:00+00:00"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert out.status_code == 200, out.text
    assert out.json()["data"]["attendance"]["status"] == "early_leave"
    # Liveness is scored server-side (FakeLivenessEngine -> 0.99 for a live face).
    assert out.json()["data"]["attendance"]["liveness_score"] == 0.99

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
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
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


async def _enroll(client: AsyncClient, hdr: dict, user_id: str, face: bytes) -> None:
    assert (
        await client.post(
            "/api/v1/enrollment",
            headers=hdr,
            data={"user_id": user_id},
            files={"image": ("f.jpg", face, "image/jpeg")},
        )
    ).status_code == 201


@pytest.mark.asyncio
async def test_liveness_rejects_spoof(client: AsyncClient, super_admin):
    """A spoofed (non-live) capture is rejected before identification."""
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "live-a")
    device = await _device_token(client, hdr)

    resp = await client.post(
        "/api/v1/attendance/checkin",
        headers={"X-Device-Token": device},
        files={"image": ("x.jpg", b"face::SPOOF::replayed-photo", "image/jpeg")},
    )
    assert resp.status_code == 422, resp.text
    assert "liveness" in resp.json()["error"].lower()


@pytest.mark.asyncio
async def test_geofence_enforced(client: AsyncClient, super_admin):
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "geo-a")
    alice = await _create_user(client, hdr, "Alice", "alice")
    await _grant_consent(client, hdr, alice)
    await _enroll(client, hdr, alice, ALICE_FACE)

    # Geofenced default schedule centred at (0,0) with a 100 m radius.
    sched = await client.post(
        "/api/v1/schedules",
        headers=hdr,
        json={
            "name": "Geofenced",
            "rules": {},
            "geofence": {"lat": 0.0, "lng": 0.0, "radius_m": 100},
            "is_default": True,
        },
    )
    assert sched.status_code == 201, sched.text
    device = await _device_token(client, hdr)
    dhdr = {"X-Device-Token": device}

    # No location -> rejected.
    no_loc = await client.post(
        "/api/v1/attendance/checkin",
        headers=dhdr,
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert no_loc.status_code == 422
    assert "location" in no_loc.json()["error"].lower()

    # Far away -> rejected.
    far = await client.post(
        "/api/v1/attendance/checkin",
        headers=dhdr,
        data={"lat": "1.0", "lng": "1.0"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert far.status_code == 422
    assert "geofence" in far.json()["error"].lower()

    # Within ~11 m -> accepted.
    near = await client.post(
        "/api/v1/attendance/checkin",
        headers=dhdr,
        data={"lat": "0.0001", "lng": "0.0"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert near.status_code == 200, near.text


@pytest.mark.asyncio
async def test_holiday_has_no_late_penalty(client: AsyncClient, super_admin):
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "hol-a")
    alice = await _create_user(client, hdr, "Alice", "alice")
    await _grant_consent(client, hdr, alice)
    await _enroll(client, hdr, alice, ALICE_FACE)

    sched = await client.post(
        "/api/v1/schedules",
        headers=hdr,
        json={
            "name": "WithHoliday",
            "rules": {"workday_start": "08:00", "workday_end": "16:00", "holidays": ["2026-06-17"]},
            "grace_minutes": 0,
            "is_default": True,
        },
    )
    assert sched.status_code == 201, sched.text
    device = await _device_token(client, hdr)

    # 09:00 on a holiday would normally be "late", but holidays carry no penalty.
    resp = await client.post(
        "/api/v1/attendance/checkin",
        headers={"X-Device-Token": device},
        data={"occurred_at": "2026-06-17T09:00:00+00:00"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attendance"]["status"] == "on_time"


@pytest.mark.asyncio
async def test_identify_does_not_block_event_loop(super_admin):
    """eng.embed() is CPU-bound and synchronous; it must run off the event loop
    so one slow identify() call doesn't stall every other concurrent request
    (real incident: a client's /integration/users poll timed out while an
    unrelated enroll/identify call was mid-inference on a single-process
    uvicorn server)."""

    class _SlowEngine:
        name = "slow"

        def embed(self, image: bytes) -> list[float]:
            time.sleep(0.3)  # stands in for CPU-bound ONNX inference
            return [0.0] * 512

    async with SessionFactory() as s:
        await _set_tenant(s, None)
        t = Tenant(name="Slow", slug="slow-loop")
        s.add(t)
        await s.flush()
        tid = t.id

    async def _run() -> None:
        async with SessionFactory() as s:
            await _set_tenant(s, tid)
            await recognition_service.identify(s, b"q", engine=_SlowEngine())

    start = time.perf_counter()
    await asyncio.gather(_run(), _run(), _run())
    elapsed = time.perf_counter() - start

    # Serialized on a blocked event loop: ~3 * 0.3s = 0.9s. Offloaded to a
    # thread pool: all three overlap, close to a single 0.3s call.
    assert elapsed < 0.6, f"identify() calls ran serially (event loop blocked): {elapsed:.2f}s"


@pytest.mark.asyncio
async def test_identify_respects_threshold(super_admin):
    """identify() accepts a match only when similarity >= the given threshold."""
    dim = 512
    enrolled_vec = [1.0] + [0.0] * (dim - 1)
    query_vec = [0.6, 0.8] + [0.0] * (dim - 2)  # cosine with enrolled_vec == 0.6

    class _StubEngine:
        name = "stub"

        def embed(self, image: bytes) -> list[float]:
            return query_vec

    async with SessionFactory() as s:
        await _set_tenant(s, None)
        t = Tenant(name="Thr", slug="thr")
        s.add(t)
        await s.flush()
        u = User(tenant_id=t.id, full_name="A", role=Role.end_user)
        s.add(u)
        await s.flush()
        s.add(FaceEmbedding(tenant_id=t.id, user_id=u.id, vector=enrolled_vec, version=1))
        await s.commit()
        tid, uid = t.id, u.id

    async with SessionFactory() as s:
        await _set_tenant(s, tid)
        lenient = await recognition_service.identify(s, b"q", threshold=0.5, engine=_StubEngine())
        strict = await recognition_service.identify(s, b"q", threshold=0.7, engine=_StubEngine())

    assert lenient is not None and lenient.user_id == uid
    assert round(lenient.similarity, 3) == 0.6
    assert strict is None  # 0.6 < 0.7 -> rejected
