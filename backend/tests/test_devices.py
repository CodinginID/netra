"""AUTH-5: device (kiosk) registration, listing, revocation, and token auth."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.security import hash_device_token
from app.db.session import SessionFactory, _set_tenant
from app.models import Device


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _onboard_tenant_admin(client: AsyncClient) -> dict[str, str]:
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {owner}"},
        json={
            "name": "Sekolah Kiosk",
            "slug": "sekolah-kiosk",
            "admin_email": "admin@sekolah-kiosk.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin Kiosk",
        },
    )
    assert resp.status_code == 201, resp.text
    admin = await _token(client, email="admin@sekolah-kiosk.app", password="adminpass123")
    return {"Authorization": f"Bearer {admin}"}


@pytest.mark.asyncio
async def test_device_register_returns_plaintext_token_once(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)

    resp = await client.post("/api/v1/devices", headers=headers, json={"name": "Lobby Kiosk"})
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    token = data["token"]
    assert token and len(token) > 20
    assert data["name"] == "Lobby Kiosk"
    assert data["status"] == "active"

    # Stored as a hash + Fernet ciphertext — never the plaintext token.
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        from sqlalchemy import select, text

        device = (await s.execute(select(Device).where(Device.id == data["id"]))).scalar_one()
        assert device.token_hash == hash_device_token(token)
        assert device.token_hash != token
        raw = (await s.execute(
            text("SELECT token_encrypted FROM devices WHERE id = :id"), {"id": data["id"]}
        )).scalar_one()
        assert raw and raw != token
        assert device.token_encrypted == token

    # List does not leak the token.
    resp = await client.get("/api/v1/devices", headers=headers)
    assert resp.status_code == 200
    listed = resp.json()["data"]["items"]
    assert len(listed) == 1
    assert "token" not in listed[0]


@pytest.mark.asyncio
async def test_device_revoke(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    reg = await client.post("/api/v1/devices", headers=headers, json={"name": "K1"})
    device_id = reg.json()["data"]["id"]

    resp = await client.post(f"/api/v1/devices/{device_id}/revoke", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "revoked"

    # Audit trail recorded register + revoke.
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        from sqlalchemy import select

        from app.models import AuditLog

        actions = {a.action for a in (await s.execute(select(AuditLog))).scalars()}
        assert "device.registered" in actions
        assert "device.revoked" in actions


@pytest.mark.asyncio
async def test_revoke_unknown_device_404(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    resp = await client.post("/api/v1/devices/does-not-exist/revoke", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_device_principal_authenticates_kiosk(client: AsyncClient, super_admin):
    """The get_device_principal dependency authenticates a kiosk via X-Device-Token."""
    from fastapi import Depends, FastAPI

    from app.api.deps import Principal, get_device_principal

    headers = await _onboard_tenant_admin(client)
    reg = await client.post("/api/v1/devices", headers=headers, json={"name": "K-auth"})
    token = reg.json()["data"]["token"]

    # Mount a throwaway route that depends on get_device_principal.
    probe = FastAPI()

    @probe.get("/whoami")
    async def whoami(p: Principal = Depends(get_device_principal)) -> dict:
        return {"role": p.role.value, "tenant_id": p.tenant_id, "device_id": p.subject}

    from httpx import ASGITransport
    from httpx import AsyncClient as AC

    async with AC(transport=ASGITransport(app=probe), base_url="http://probe") as pc:
        ok = await pc.get("/whoami", headers={"X-Device-Token": token})
        assert ok.status_code == 200, ok.text
        body = ok.json()
        assert body["role"] == "kiosk"
        assert body["tenant_id"]

        # Missing token -> 401.
        assert (await pc.get("/whoami")).status_code == 401
        # Bad token -> 401.
        assert (await pc.get("/whoami", headers={"X-Device-Token": "nope"})).status_code == 401

    # Revoked device cannot authenticate.
    device_id = reg.json()["data"]["id"]
    await client.post(f"/api/v1/devices/{device_id}/revoke", headers=headers)
    async with AC(transport=ASGITransport(app=probe), base_url="http://probe") as pc:
        assert (await pc.get("/whoami", headers={"X-Device-Token": token})).status_code == 401


@pytest.mark.asyncio
async def test_deleted_device_token_rejected_until_restored(client: AsyncClient, super_admin):
    """Deleting an ACTIVE device (no revoke first) must stop its token working."""
    from fastapi import Depends, FastAPI
    from httpx import ASGITransport
    from httpx import AsyncClient as AC

    from app.api.deps import Principal, get_device_principal

    headers = await _onboard_tenant_admin(client)
    reg = await client.post("/api/v1/devices", headers=headers, json={"name": "K-del"})
    token = reg.json()["data"]["token"]
    device_id = reg.json()["data"]["id"]

    probe = FastAPI()

    @probe.get("/whoami")
    async def whoami(p: Principal = Depends(get_device_principal)) -> dict:
        return {"device_id": p.subject}

    async def status_code() -> int:
        async with AC(transport=ASGITransport(app=probe), base_url="http://probe") as pc:
            return (await pc.get("/whoami", headers={"X-Device-Token": token})).status_code

    assert await status_code() == 200
    assert (await client.delete(f"/api/v1/devices/{device_id}", headers=headers)).status_code == 204
    assert await status_code() == 401
    # Undo (restore from trash) brings the same token back.
    restored = await client.post(f"/api/v1/devices/{device_id}/restore", headers=headers)
    assert restored.status_code == 200
    assert await status_code() == 200


@pytest.mark.asyncio
async def test_view_device_token(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    reg = (await client.post("/api/v1/devices", headers=headers, json={"name": "K-view"})).json()
    device_id = reg["data"]["id"]
    assert reg["data"]["token_available"] is True

    resp = await client.get(f"/api/v1/devices/{device_id}/token", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["token"] == reg["data"]["token"]

    # After a reset the view returns the NEW token.
    regen = await client.post(f"/api/v1/devices/{device_id}/regenerate-token", headers=headers)
    new_token = regen.json()["data"]["token"]
    resp = await client.get(f"/api/v1/devices/{device_id}/token", headers=headers)
    assert resp.json()["data"]["token"] == new_token

    # Viewing is audited.
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        from sqlalchemy import select

        from app.models import AuditLog

        actions = [a.action for a in (await s.execute(select(AuditLog))).scalars()]
        assert actions.count("device.token_viewed") == 2

    # Revoked device: nothing to view.
    await client.post(f"/api/v1/devices/{device_id}/revoke", headers=headers)
    resp = await client.get(f"/api/v1/devices/{device_id}/token", headers=headers)
    assert resp.status_code == 409

    # Legacy device (hash only): 409, listed as not viewable.
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        from sqlalchemy import update

        await client.post(f"/api/v1/devices/{device_id}/regenerate-token", headers=headers)
        await s.execute(update(Device).where(Device.id == device_id).values(token_encrypted=None))
        await s.commit()
    resp = await client.get(f"/api/v1/devices/{device_id}/token", headers=headers)
    assert resp.status_code == 409
    listed = (await client.get("/api/v1/devices", headers=headers)).json()["data"]["items"]
    assert listed[0]["token_available"] is False
