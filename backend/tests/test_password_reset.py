"""Admin reset of a staff password (forgotten password) — POST /users/{id}/reset-password."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


async def _login(client: AsyncClient, email: str, password: str, ip: str):
    return await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"x-forwarded-for": ip},
    )


async def _token(client: AsyncClient, email: str, password: str, ip: str) -> str:
    resp = await _login(client, email, password, ip)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _auth(client: AsyncClient, email: str, password: str, ip: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {await _token(client, email, password, ip)}"}


async def _reset(client: AsyncClient, headers: dict, user_id: str, password: str):
    return await client.post(
        f"/api/v1/users/{user_id}/reset-password",
        headers=headers,
        json={"new_password": password},
    )


async def _tenant(client: AsyncClient, owner: dict, slug: str) -> str:
    resp = await client.post(
        "/api/v1/tenants",
        headers=owner,
        json={
            "name": f"Tenant {slug}",
            "slug": slug,
            "admin_email": f"admin@{slug}.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _admin_id(client: AsyncClient, headers: dict, email: str) -> str:
    resp = await client.get("/api/v1/users?limit=100", headers=headers)
    assert resp.status_code == 200, resp.text
    return next(u["id"] for u in resp.json()["data"]["items"] if u["email"] == email)


@pytest.mark.asyncio
async def test_super_admin_resets_tenant_admin_password(client: AsyncClient, super_admin):
    owner = await _auth(client, "owner@netra.app", "ownerpass123", "10.91.0.1")
    tenant_id = await _tenant(client, owner, "pwreset")
    scoped = {**owner, "X-Tenant-Id": tenant_id}
    admin_id = await _admin_id(client, scoped, "admin@pwreset.app")

    resp = await _reset(client, scoped, admin_id, "brandnew123")
    assert resp.status_code == 200, resp.text

    assert (
        await _login(client, "admin@pwreset.app", "adminpass123", "10.91.0.2")
    ).status_code == 401
    assert (
        await _login(client, "admin@pwreset.app", "brandnew123", "10.91.0.3")
    ).status_code == 200


@pytest.mark.asyncio
async def test_reset_rejects_self_short_and_end_user(client: AsyncClient, super_admin):
    owner = await _auth(client, "owner@netra.app", "ownerpass123", "10.91.1.1")
    await _tenant(client, owner, "pwrules")
    admin = await _auth(client, "admin@pwrules.app", "adminpass123", "10.91.1.2")
    admin_id = await _admin_id(client, admin, "admin@pwrules.app")

    self_reset = await _reset(client, admin, admin_id, "brandnew123")
    assert self_reset.status_code == 400

    end_user = await client.post(
        "/api/v1/users", headers=admin, json={"full_name": "Siswa", "external_id": "NIS-1"}
    )
    assert end_user.status_code == 201, end_user.text
    eu = await _reset(client, admin, end_user.json()["data"]["id"], "brandnew123")
    assert eu.status_code == 400

    short = await _reset(client, admin, admin_id, "x")
    assert short.status_code == 422


@pytest.mark.asyncio
async def test_tenant_admin_cannot_reset_other_tenant_user(client: AsyncClient, super_admin):
    owner = await _auth(client, "owner@netra.app", "ownerpass123", "10.91.2.1")
    other_id = await _tenant(client, owner, "pwother")
    other_admin = await _admin_id(client, {**owner, "X-Tenant-Id": other_id}, "admin@pwother.app")
    await _tenant(client, owner, "pwmine")
    mine = await _auth(client, "admin@pwmine.app", "adminpass123", "10.91.2.2")

    resp = await _reset(client, mine, other_admin, "brandnew123")
    assert resp.status_code == 404
