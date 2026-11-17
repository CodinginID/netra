"""One face = one identity per tenant: a face already enrolled for user A must
never be enrolled again under user B (any enrollment path).

FakeFaceEngine: identical image bytes -> identical embedding (similarity 1.0).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import SessionFactory, _set_tenant
from app.models import FaceEmbedding, User
from tests.test_recognition import _create_user, _grant_consent, _onboard, _token

FACE_A = b"face::dup::alice"
FACE_B = b"face::dup::bob"


async def _setup(client: AsyncClient, slug: str) -> tuple[dict, str, str]:
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, slug)
    alice = await _create_user(client, hdr, "Alice", f"alice-{slug}")
    bob = await _create_user(client, hdr, "Bob", f"bob-{slug}")
    for uid in (alice, bob):
        await _grant_consent(client, hdr, uid)
    return hdr, alice, bob


async def _enroll(client: AsyncClient, hdr: dict, user_id: str, face: bytes):
    return await client.post(
        "/api/v1/enrollment",
        headers=hdr,
        data={"user_id": user_id},
        files={"image": ("f.jpg", face, "image/jpeg")},
    )


async def _enroll_multi(client: AsyncClient, hdr: dict, user_id: str, faces: list[bytes]):
    return await client.post(
        "/api/v1/enrollment/multi",
        headers=hdr,
        data={"user_id": user_id},
        files=[("images", (f"{i}.jpg", f, "image/jpeg")) for i, f in enumerate(faces)],
    )


async def _embeddings_of(user_id: str) -> int:
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        rows = await s.execute(select(FaceEmbedding.id).where(FaceEmbedding.user_id == user_id))
        return len(rows.all())


@pytest.mark.asyncio
async def test_same_face_cannot_enroll_under_another_user(client: AsyncClient, super_admin):
    hdr, alice, bob = await _setup(client, "dup-a")
    assert (await _enroll(client, hdr, alice, FACE_A)).status_code == 201

    resp = await _enroll(client, hdr, bob, FACE_A)
    assert resp.status_code == 409, resp.text
    assert "Alice" in resp.json()["error"]  # staff sees who already owns it

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        bob_row = (await s.execute(select(User).where(User.id == bob))).scalar_one()
        assert bob_row.enrolled is False
    assert await _embeddings_of(bob) == 0


@pytest.mark.asyncio
async def test_multi_rejects_if_any_angle_is_taken(client: AsyncClient, super_admin):
    hdr, alice, bob = await _setup(client, "dup-b")
    assert (await _enroll_multi(client, hdr, alice, [FACE_A])).status_code == 201

    resp = await _enroll_multi(client, hdr, bob, [FACE_B, FACE_A])
    assert resp.status_code == 409, resp.text
    assert await _embeddings_of(bob) == 0
    assert await _embeddings_of(alice) == 1  # owner's data untouched


@pytest.mark.asyncio
async def test_same_user_can_re_enroll_and_distinct_faces_pass(client: AsyncClient, super_admin):
    hdr, alice, bob = await _setup(client, "dup-c")
    assert (await _enroll_multi(client, hdr, alice, [FACE_A])).status_code == 201
    # Re-enrolling the same person with the same face replaces, not conflicts.
    assert (await _enroll_multi(client, hdr, alice, [FACE_A])).status_code == 201
    assert await _embeddings_of(alice) == 1
    # A different face for a different person is fine.
    assert (await _enroll(client, hdr, bob, FACE_B)).status_code == 201


@pytest.mark.asyncio
async def test_same_face_allowed_in_another_tenant(client: AsyncClient, super_admin):
    """Duplicate check is tenant-scoped (RLS): one person may belong to two tenants."""
    hdr_a, alice_a, _ = await _setup(client, "dup-d")
    hdr_b, alice_b, _ = await _setup(client, "dup-e")
    assert (await _enroll(client, hdr_a, alice_a, FACE_A)).status_code == 201
    assert (await _enroll(client, hdr_b, alice_b, FACE_A)).status_code == 201
