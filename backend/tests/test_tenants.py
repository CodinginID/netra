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
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    oheaders = {"Authorization": f"Bearer {owner}"}

    reg = await client.post(
        "/api/v1/tenants",
        headers=oheaders,
        json={
            "name": "Sekolah Susp",
            "slug": "sekolah-susp",
            "admin_email": "admin@sekolah-susp.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin Susp",
        },
    )
    assert reg.status_code == 201, reg.text
    tenant_id = reg.json()["data"]["id"]

    # Tenant admin can log in while active.
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@sekolah-susp.app", "password": "adminpass123"},
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
        json={"email": "admin@sekolah-susp.app", "password": "adminpass123"},
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
            json={"email": "admin@sekolah-susp.app", "password": "adminpass123"},
        )
    ).status_code == 200


@pytest.mark.asyncio
async def test_tenant_admin_manages_own_config(client: AsyncClient, super_admin):
    """TENANT-2: tenant admin reads + updates own config space."""
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    reg = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {owner}"},
        json={
            "name": "Sekolah Cfg",
            "slug": "sekolah-cfg",
            "admin_email": "cfgadmin@sekolah-cfg.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Cfg Admin",
        },
    )
    assert reg.status_code == 201, reg.text

    admin = await _token(
        client, email="cfgadmin@sekolah-cfg.app", password="adminpass123"
    )
    aheaders = {"Authorization": f"Bearer {admin}"}

    # Defaults on a fresh tenant.
    got = await client.get("/api/v1/tenants/me/config", headers=aheaders)
    assert got.status_code == 200, got.text
    assert got.json()["data"]["attendance"]["timezone"] == "Asia/Jakarta"

    # Update branding + attendance defaults.
    new_cfg = {
        "branding": {"display_name": "SD Maju", "primary_color": "#1a56db"},
        "attendance": {"grace_minutes": 15, "workday_start": "07:30", "workday_end": "15:00"},
        "kiosk": {"require_liveness": True, "allow_self_enrollment": False},
    }
    put = await client.put("/api/v1/tenants/me/config", headers=aheaders, json=new_cfg)
    assert put.status_code == 200, put.text
    assert put.json()["data"]["attendance"]["grace_minutes"] == 15

    # Persisted: read back.
    again = await client.get("/api/v1/tenants/me/config", headers=aheaders)
    assert again.json()["data"]["branding"]["primary_color"] == "#1a56db"

    # Audit row written.
    async with SessionFactory() as s:
        await _set_tenant(s, None)
        actions = {a.action for a in (await s.execute(select(AuditLog))).scalars()}
        assert "tenant.config.updated" in actions

    # Invalid color rejected (422).
    bad = await client.put(
        "/api/v1/tenants/me/config",
        headers=aheaders,
        json={"branding": {"primary_color": "notacolor"}},
    )
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_non_admin_cannot_update_config(client: AsyncClient, super_admin):
    """RBAC: a non-admin staff user (supervisor) is forbidden from config endpoints."""
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    oheaders = {"Authorization": f"Bearer {owner}"}
    reg = await client.post(
        "/api/v1/tenants",
        headers=oheaders,
        json={
            "name": "Sekolah RBAC",
            "slug": "sekolah-rbac",
            "admin_email": "rbacadmin@sekolah-rbac.app",
            "admin_password": "adminpass123",
            "admin_full_name": "RBAC Admin",
        },
    )
    assert reg.status_code == 201, reg.text
    admin = await _token(client, email="rbacadmin@sekolah-rbac.app", password="adminpass123")
    cu = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin}"},
        json={
            "full_name": "Budi Supervisor",
            "role": "supervisor",
            "email": "budi@sekolah-rbac.app",
            "password": "budipass123",
        },
    )
    assert cu.status_code == 201, cu.text
    sup = await _token(client, email="budi@sekolah-rbac.app", password="budipass123")
    resp = await client.put(
        "/api/v1/tenants/me/config",
        headers={"Authorization": f"Bearer {sup}"},
        json={"branding": {"display_name": "hack"}},
    )
    assert resp.status_code == 403
