"""Integration user upsert: POST /integration/users (X-API-Key, scope users:write).

Covers the client-requested inbound sync flow: idempotent create/update by
external_id (per tenant), bulk payloads, scope enforcement, and that a user
created here is the SAME row the embed enrollment flow later resolves.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


async def _token(client: AsyncClient, **payload) -> str:
    # Unique X-Forwarded-For per login so this module never trips the
    # per-IP login rate limiter (10/min) when the whole suite runs fast.
    ip = f"10.77.{abs(hash(payload['email'])) % 250}.{abs(hash(payload['email']) >> 8) % 250}"
    resp = await client.post("/api/v1/auth/login", json=payload, headers={"x-forwarded-for": ip})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


# Login is rate-limited per-process — cache the owner JWT across this module.
_owner_token_cache: dict[str, str] = {}


async def _owner_token(client: AsyncClient) -> str:
    if "token" not in _owner_token_cache:
        _owner_token_cache["token"] = await _token(
            client, email="owner@netra.app", password="ownerpass123"
        )
    return _owner_token_cache["token"]


async def _onboard_tenant_admin(client: AsyncClient, slug: str = "syncco") -> dict[str, str]:
    owner = await _owner_token(client)
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {owner}"},
        json={
            "name": f"Tenant {slug}",
            "slug": slug,
            "admin_email": f"admin-{slug}@netra.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin",
        },
    )
    assert resp.status_code == 201, resp.text
    admin = await _token(client, email=f"admin-{slug}@netra.app", password="adminpass123")
    return {"Authorization": f"Bearer {admin}"}


async def _create_key(client: AsyncClient, headers: dict, *, scopes: list[str]) -> dict:
    resp = await client.post(
        "/api/v1/api-keys",
        headers=headers,
        json={"name": "Client App", "scopes": scopes},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


@pytest.mark.asyncio
async def test_upsert_single_user_creates_end_user(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(client, headers, scopes=["users:write", "users:read"])

    resp = await client.post(
        "/api/v1/integration/users",
        headers={"X-API-Key": key["key"]},
        json={"external_id": "NIK-001", "full_name": "Budi Santoso"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["summary"] == {"received": 1, "created": 1, "updated": 0}
    item = data["items"][0]
    assert item["created"] is True
    assert item["external_id"] == "NIK-001"
    assert item["full_name"] == "Budi Santoso"

    # Visible in the pull API too.
    listed = (
        await client.get("/api/v1/integration/users", headers={"X-API-Key": key["key"]})
    ).json()["data"]
    assert listed["total"] == 1
    assert listed["items"][0]["external_id"] == "NIK-001"
    assert listed["items"][0]["enrolled"] is False


@pytest.mark.asyncio
async def test_upsert_is_idempotent_and_updates_full_name(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client, slug="syncco2")
    key = await _create_key(client, headers, scopes=["users:write"])
    api = {"X-API-Key": key["key"]}

    first = await client.post(
        "/api/v1/integration/users",
        headers=api,
        json={"external_id": "NIK-002", "full_name": "Siti"},
    )
    assert first.status_code == 200, first.text
    created_id = first.json()["data"]["items"][0]["id"]

    second = await client.post(
        "/api/v1/integration/users",
        headers=api,
        json={"external_id": "NIK-002", "full_name": "Siti Rahma"},
    )
    assert second.status_code == 200, second.text
    data = second.json()["data"]
    assert data["summary"] == {"received": 1, "created": 0, "updated": 1}
    item = data["items"][0]
    assert item["created"] is False
    assert item["id"] == created_id  # same row, not a duplicate
    assert item["full_name"] == "Siti Rahma"


@pytest.mark.asyncio
async def test_bulk_upsert_mixed_create_and_update(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client, slug="syncco3")
    key = await _create_key(client, headers, scopes=["users:write"])
    api = {"X-API-Key": key["key"]}

    seed = await client.post(
        "/api/v1/integration/users",
        headers=api,
        json={"external_id": "EMP-1", "full_name": "Andi"},
    )
    assert seed.status_code == 200, seed.text

    resp = await client.post(
        "/api/v1/integration/users",
        headers=api,
        json=[
            {"external_id": "EMP-1", "full_name": "Andi Wijaya"},
            {"external_id": "EMP-2", "full_name": "Rina"},
            {"external_id": "EMP-3", "full_name": "Dewi"},
        ],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["summary"] == {"received": 3, "created": 2, "updated": 1}
    by_ext = {i["external_id"]: i for i in data["items"]}
    assert by_ext["EMP-1"]["created"] is False
    assert by_ext["EMP-1"]["full_name"] == "Andi Wijaya"
    assert by_ext["EMP-2"]["created"] is True
    assert by_ext["EMP-3"]["created"] is True


@pytest.mark.asyncio
async def test_bulk_upsert_dedupes_repeated_external_id(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client, slug="syncco4")
    key = await _create_key(client, headers, scopes=["users:write"])

    resp = await client.post(
        "/api/v1/integration/users",
        headers={"X-API-Key": key["key"]},
        json=[
            {"external_id": "DUP-1", "full_name": "First"},
            {"external_id": "DUP-1", "full_name": "Last Wins"},
        ],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert len(data["items"]) == 1
    assert data["items"][0]["full_name"] == "Last Wins"


@pytest.mark.asyncio
async def test_upsert_requires_users_write_scope(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client, slug="syncco5")
    key = await _create_key(client, headers, scopes=["users:read"])

    resp = await client.post(
        "/api/v1/integration/users",
        headers={"X-API-Key": key["key"]},
        json={"external_id": "NIK-403", "full_name": "No Scope"},
    )
    assert resp.status_code == 403
    assert "users:write" in resp.json()["error"]


@pytest.mark.asyncio
async def test_bulk_upsert_rejects_oversized_payload(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client, slug="syncco6")
    key = await _create_key(client, headers, scopes=["users:write"])

    payload = [{"external_id": f"BIG-{i}", "full_name": f"User {i}"} for i in range(501)]
    resp = await client.post(
        "/api/v1/integration/users", headers={"X-API-Key": key["key"]}, json=payload
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_upsert_restores_soft_deleted_user(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client, slug="syncco7")
    key = await _create_key(client, headers, scopes=["users:write"])
    api = {"X-API-Key": key["key"]}

    created = await client.post(
        "/api/v1/integration/users",
        headers=api,
        json={"external_id": "DEL-1", "full_name": "Akan Dihapus"},
    )
    assert created.status_code == 200, created.text
    user_id = created.json()["data"]["items"][0]["id"]

    deleted = await client.delete(f"/api/v1/users/{user_id}", headers=headers)
    assert deleted.status_code in (200, 204), deleted.text

    # Re-sync of the same external_id must revive the row (unique constraint on
    # (tenant_id, external_id_hash) covers soft-deleted rows too), not 500.
    resync = await client.post(
        "/api/v1/integration/users",
        headers=api,
        json={"external_id": "DEL-1", "full_name": "Kembali Aktif"},
    )
    assert resync.status_code == 200, resync.text
    item = resync.json()["data"]["items"][0]
    assert item["id"] == user_id
    assert item["created"] is False
    assert item["full_name"] == "Kembali Aktif"
