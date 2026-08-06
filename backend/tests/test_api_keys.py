"""Tenant API keys: creation, per-key embed origin allowlist, and enforcement
on POST /integration/embed-sessions (return_origin must match the CALLING
key's own allowlist, not a tenant-wide one)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


# The login endpoint is rate-limited per-process (10/min/IP) — cache the owner
# JWT across tests in this module instead of re-logging in for every test.
# Safe because Principal auth decodes the JWT claims only, with no DB lookup,
# so the token stays valid even though `super_admin` recreates the row per test.
_owner_token_cache: dict[str, str] = {}


async def _owner_token(client: AsyncClient) -> str:
    if "token" not in _owner_token_cache:
        _owner_token_cache["token"] = await _token(
            client, email="owner@netra.app", password="ownerpass123"
        )
    return _owner_token_cache["token"]


async def _onboard_tenant_admin(client: AsyncClient, slug: str = "acme") -> dict[str, str]:
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


async def _create_key(
    client: AsyncClient,
    headers: dict,
    *,
    scopes: list[str],
    allowed_origins: list[str] | None = None,
) -> dict:
    resp = await client.post(
        "/api/v1/api-keys",
        headers=headers,
        json={"name": "Client App", "scopes": scopes, "allowed_origins": allowed_origins or []},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


@pytest.mark.asyncio
async def test_create_api_key_stores_allowed_origins(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(
        client,
        headers,
        scopes=["embed:enroll"],
        allowed_origins=["https://app.acme.id", "http://localhost:7002"],
    )
    assert key["allowed_origins"] == ["https://app.acme.id", "http://localhost:7002"]

    listed = (await client.get("/api/v1/api-keys", headers=headers)).json()["data"]
    assert listed[0]["allowed_origins"] == ["https://app.acme.id", "http://localhost:7002"]


@pytest.mark.asyncio
async def test_create_api_key_rejects_malformed_origin(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    resp = await client.post(
        "/api/v1/api-keys",
        headers=headers,
        json={"name": "Bad", "scopes": ["embed:enroll"], "allowed_origins": ["not-a-url"]},
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_update_api_key_origins(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(
        client, headers, scopes=["embed:enroll"], allowed_origins=["https://old.acme.id"]
    )

    resp = await client.patch(
        f"/api/v1/api-keys/{key['id']}",
        headers=headers,
        json={"allowed_origins": ["https://new.acme.id"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["allowed_origins"] == ["https://new.acme.id"]

    listed = (await client.get("/api/v1/api-keys", headers=headers)).json()["data"]
    assert listed[0]["allowed_origins"] == ["https://new.acme.id"]


@pytest.mark.asyncio
async def test_update_api_key_origins_unknown_key_404(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    resp = await client.patch(
        "/api/v1/api-keys/does-not-exist", headers=headers, json={"allowed_origins": ["https://x.id"]}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_embed_session_allowed_origin_succeeds(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(
        client, headers, scopes=["embed:enroll"], allowed_origins=["https://app.acme.id"]
    )

    resp = await client.post(
        "/api/v1/integration/embed-sessions",
        headers={"X-API-Key": key["key"]},
        json={
            "external_id": "NIS123",
            "full_name": "Budi",
            "return_origin": "https://app.acme.id",
            "is_minor": False,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["url"]


@pytest.mark.asyncio
async def test_embed_session_url_uses_configured_embed_base_url(
    client: AsyncClient, super_admin, monkeypatch
):
    """Regression test for a prod incident: the minted url must come from
    EMBED_BASE_URL, never a hardcoded dev default — a client saw `data.url`
    point at http://localhost:5173 in production because that fallback used
    to exist. There must be no such fallback left."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "embed_base_url", "https://netra.flowbiz.id")

    headers = await _onboard_tenant_admin(client)
    key = await _create_key(
        client, headers, scopes=["embed:enroll"], allowed_origins=["https://app.acme.id"]
    )

    resp = await client.post(
        "/api/v1/integration/embed-sessions",
        headers={"X-API-Key": key["key"]},
        json={
            "external_id": "NIS123",
            "full_name": "Budi",
            "return_origin": "https://app.acme.id",
            "is_minor": False,
        },
    )
    assert resp.status_code == 201, resp.text
    url = resp.json()["data"]["url"]
    assert url.startswith("https://netra.flowbiz.id/embed/enroll?token="), url
    assert "localhost" not in url


@pytest.mark.asyncio
async def test_embed_session_disallowed_origin_403(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(
        client, headers, scopes=["embed:enroll"], allowed_origins=["https://app.acme.id"]
    )

    resp = await client.post(
        "/api/v1/integration/embed-sessions",
        headers={"X-API-Key": key["key"]},
        json={
            "external_id": "NIS123",
            "full_name": "Budi",
            "return_origin": "https://evil.example.com",
            "is_minor": False,
        },
    )
    assert resp.status_code == 403, resp.text
    assert "allowlist" in resp.json()["error"]


@pytest.mark.asyncio
async def test_embed_session_allowlist_is_scoped_per_key(client: AsyncClient, super_admin):
    """Two keys on the same tenant each keep their own origin list — a dev key's
    localhost origin must not leak into a prod key's allowlist, and vice versa."""
    headers = await _onboard_tenant_admin(client)
    dev_key = await _create_key(
        client, headers, scopes=["embed:enroll"], allowed_origins=["http://localhost:7002"]
    )
    prod_key = await _create_key(
        client, headers, scopes=["embed:enroll"], allowed_origins=["https://app.acme.id"]
    )

    payload = {
        "external_id": "NIS123",
        "full_name": "Budi",
        "return_origin": "http://localhost:7002",
        "is_minor": False,
    }

    ok = await client.post(
        "/api/v1/integration/embed-sessions", headers={"X-API-Key": dev_key["key"]}, json=payload
    )
    assert ok.status_code == 201, ok.text

    blocked = await client.post(
        "/api/v1/integration/embed-sessions", headers={"X-API-Key": prod_key["key"]}, json=payload
    )
    assert blocked.status_code == 403, blocked.text
