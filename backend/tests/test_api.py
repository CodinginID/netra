"""End-to-end API tests: health, login, tenant onboarding, RBAC, user mgmt."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "up"


@pytest.mark.asyncio
async def test_root(client: AsyncClient):
    resp = await client.get("/")
    assert resp.status_code == 200
    assert resp.json()["name"] == "netra"


@pytest.mark.asyncio
async def test_login_success_super_admin(client: AsyncClient, super_admin):
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "owner@netra.app", "password": "ownerpass123"}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["role"] == "super_admin"
    assert data["access_token"]


@pytest.mark.asyncio
async def test_login_is_case_insensitive(client: AsyncClient, super_admin):
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "Owner@Netra.App", "password": "ownerpass123"}
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["role"] == "super_admin"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, super_admin):
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "owner@netra.app", "password": "wrong"}
    )
    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid credentials"


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


@pytest.mark.asyncio
async def test_tenant_onboarding_flow(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Super admin creates a tenant (+ first tenant admin).
    resp = await client.post(
        "/api/v1/tenants",
        headers=headers,
        json={
            "name": "Sekolah Maju",
            "slug": "sekolah-maju",
            "admin_email": "admin@sekolah-maju.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin Sekolah",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["slug"] == "sekolah-maju"

    # Tenant admin can now log in by email — tenant_id comes from the JWT, no slug.
    admin_token = await _token(
        client, email="admin@sekolah-maju.app", password="adminpass123"
    )
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Tenant admin creates an end user with external_id (NIS).
    resp = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"full_name": "Siswa Satu", "role": "end_user", "external_id": "1023456"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["external_id"] == "1023456"

    # And can list users (RLS-scoped to own tenant): the tenant admin created
    # at onboarding + the end user just added = 2 users in this tenant.
    resp = await client.get("/api/v1/users", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 2


@pytest.mark.asyncio
async def test_rbac_tenant_admin_cannot_create_tenant(client: AsyncClient, super_admin):
    # Onboard a tenant; its admin is a non-super staff user.
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Tenant Org",
            "slug": "t-org",
            "admin_email": "tadmin@t-org.app",
            "admin_password": "tapass123",
            "admin_full_name": "Tenant Admin",
        },
    )
    admin_token = await _token(client, email="tadmin@t-org.app", password="tapass123")

    # Tenant admin attempts a super-admin-only action -> 403.
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Tenant X",
            "slug": "x-org",
            "admin_email": "xadmin@x-org.app",
            "admin_password": "xpass1234",
            "admin_full_name": "Admin X",
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient):
    resp = await client.get("/api/v1/users")
    assert resp.status_code == 401
