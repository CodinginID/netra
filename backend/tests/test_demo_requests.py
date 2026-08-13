"""Tests for the public demo-request capture endpoint + super-admin review."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.ratelimit import reset_demo_request_limiter


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


@pytest.mark.asyncio
async def test_create_demo_request_is_public(client: AsyncClient):
    """No Authorization header required — the landing page is unauthenticated."""
    resp = await client.post(
        "/api/v1/demo-requests",
        json={
            "name": "Budi Santoso",
            "organization": "SMA Negeri 1",
            "email": "budi@sman1.sch.id",
            "phone": "081234567890",
            "message": "Butuh demo untuk 500 siswa",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["name"] == "Budi Santoso"
    assert data["organization"] == "SMA Negeri 1"
    assert data["email"] == "budi@sman1.sch.id"
    assert data["status"] == "new"


@pytest.mark.asyncio
async def test_create_demo_request_requires_name_org_email(client: AsyncClient):
    resp = await client.post(
        "/api/v1/demo-requests",
        json={"name": "", "organization": "SMA Negeri 1", "email": "not-an-email"},
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_create_demo_request_rate_limited(client: AsyncClient):
    reset_demo_request_limiter()
    payload = {
        "name": "Rate Limit Test",
        "organization": "Org",
        "email": "rl@example.com",
    }
    for _ in range(5):
        resp = await client.post("/api/v1/demo-requests", json=payload)
        assert resp.status_code == 201, resp.text

    resp = await client.post("/api/v1/demo-requests", json=payload)
    assert resp.status_code == 429, resp.text
    reset_demo_request_limiter()


@pytest.mark.asyncio
async def test_list_demo_requests_requires_super_admin(client: AsyncClient):
    resp = await client.get("/api/v1/demo-requests")
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_list_and_update_demo_request(client: AsyncClient, super_admin):
    await client.post(
        "/api/v1/demo-requests",
        json={"name": "Ani", "organization": "Toko Ani", "email": "ani@example.com"},
    )

    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/v1/demo-requests", headers=headers)
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Ani"
    assert items[0]["status"] == "new"

    demo_request_id = items[0]["id"]
    resp = await client.patch(
        f"/api/v1/demo-requests/{demo_request_id}",
        headers=headers,
        json={"status": "contacted"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "contacted"

    resp = await client.get("/api/v1/demo-requests?status=contacted", headers=headers)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["data"]["items"]) == 1

    resp = await client.get("/api/v1/demo-requests?status=new", headers=headers)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["data"]["items"]) == 0
