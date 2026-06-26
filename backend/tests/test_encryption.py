"""OPS-5: external_id is encrypted at rest, plaintext via API; uniqueness held."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.core.security import decrypt_field
from app.db.session import SessionFactory, _set_tenant
from app.db.types import external_id_digest
from app.models import User


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _admin_headers(client: AsyncClient) -> str:
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {owner}"},
        json={
            "name": "Sekolah Enc",
            "slug": "sekolah-enc",
            "admin_email": "admin@sekolah-enc.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin Enc",
        },
    )
    admin = await _token(client, email="admin@sekolah-enc.app", password="adminpass123")
    return f"Bearer {admin}"


@pytest.mark.asyncio
async def test_external_id_ciphertext_at_rest_plaintext_via_api(client: AsyncClient, super_admin):
    auth = await _admin_headers(client)
    nik = "3201234567890001"

    resp = await client.post(
        "/api/v1/users",
        headers={"Authorization": auth},
        json={"full_name": "Siswa NIK", "role": "end_user", "external_id": nik},
    )
    assert resp.status_code == 201, resp.text
    user_id = resp.json()["data"]["id"]
    # API returns plaintext (decrypted transparently).
    assert resp.json()["data"]["external_id"] == nik

    # Raw column on disk is ciphertext, not the plaintext NIK.
    async with SessionFactory() as s:
        await _set_tenant(s, None)
        raw = (
            await s.execute(
                text("SELECT external_id, external_id_hash FROM users WHERE id = :i"),
                {"i": user_id},
            )
        ).one()
        raw_external_id, raw_hash = raw
        assert raw_external_id != nik, "external_id must NOT be stored in plaintext"
        assert decrypt_field(raw_external_id) == nik, "ciphertext must decrypt back to the NIK"
        assert raw_hash == external_id_digest(nik)

    # ORM read decrypts transparently.
    async with SessionFactory() as s:
        await _set_tenant(s, None)
        user = (await s.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.external_id == nik


@pytest.mark.asyncio
async def test_external_id_uniqueness_per_tenant(client: AsyncClient, super_admin):
    auth = await _admin_headers(client)
    payload = {"full_name": "Dup", "role": "end_user", "external_id": "DUP-001"}

    r1 = await client.post("/api/v1/users", headers={"Authorization": auth}, json=payload)
    assert r1.status_code == 201, r1.text
    # Same external_id in the same tenant -> conflict (hash collision constraint).
    r2 = await client.post("/api/v1/users", headers={"Authorization": auth}, json=payload)
    assert r2.status_code == 409, r2.text
