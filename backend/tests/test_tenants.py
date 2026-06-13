"""TENANT-1: suspend / activate flip TenantStatus, write audit, block login."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import SessionFactory, _set_tenant
from app.models import AuditLog, Tenant, TenantStatus


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


@pytest.mark.asyncio
async def test_suspend_then_activate_tenant(client: AsyncClient, super_admin):
    owner = await _token(client, username="owner", password="ownerpass123")
    oheaders = {"Authorization": f"Bearer {owner}"}

    reg = await client.post(
        "/api/v1/tenants",
        headers=oheaders,
        json={
            "name": "Sekolah Susp", "slug": "sekolah-susp", "admin_username": "admin",
            "admin_password": "adminpass123", "admin_full_name": "Admin Susp",
        },
    )
    assert reg.status_code == 201, reg.text
    tenant_id = reg.json()["data"]["id"]

    # Tenant admin can log in while active.
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "adminpass123", "tenant_slug": "sekolah-susp"},
        )
    ).status_code == 200

    # Suspend -> status flips, audit row written.
    resp = await client.post(f"/api/v1/tenants/{tenant_id}/suspend", headers=oheaders)
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "suspended"

    async with SessionFactory() as s:
        await _set_tenant(s, None)
        tenant = (await s.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
        assert tenant.status == TenantStatus.suspended
        actions = {a.action for a in (await s.execute(select(AuditLog))).scalars()}
        assert "tenant.suspended" in actions

    # Suspended tenant's user can no longer log in.
    blocked = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "adminpass123", "tenant_slug": "sekolah-susp"},
    )
    assert blocked.status_code == 401
    assert blocked.json()["error"] == "Tenant is suspended"

    # Activate -> status flips back, audit row written, login works again.
    resp = await client.post(f"/api/v1/tenants/{tenant_id}/activate", headers=oheaders)
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "active"

    async with SessionFactory() as s:
        await _set_tenant(s, None)
        actions = {a.action for a in (await s.execute(select(AuditLog))).scalars()}
        assert "tenant.active" in actions

    assert (
        await client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "adminpass123", "tenant_slug": "sekolah-susp"},
        )
    ).status_code == 200
