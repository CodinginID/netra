"""Per-item hard-delete from the trash page."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.models import Device, Schedule, Tenant, User
from app.services.soft_delete import hard_delete
from tests.test_recognition import _create_user, _onboard, _token


@dataclass
class _TenantAdmin:
    """A freshly onboarded tenant's admin plus helpers to create its entities."""

    client: AsyncClient
    headers: dict

    async def _post(self, path: str, body: dict) -> SimpleNamespace:
        resp = await self.client.post(path, headers=self.headers, json=body)
        assert resp.status_code == 201, resp.text
        return SimpleNamespace(**resp.json()["data"])

    async def _create_user(self, full_name: str, external_id: str) -> SimpleNamespace:
        return SimpleNamespace(
            id=await _create_user(self.client, self.headers, full_name, external_id)
        )

    async def _create_device(self, name: str) -> SimpleNamespace:
        return await self._post("/api/v1/devices", {"name": name})

    async def _create_schedule(self, name: str) -> SimpleNamespace:
        return await self._post("/api/v1/schedules", {"name": name, "rules": {}})

    @staticmethod
    def _uuid() -> str:
        return str(uuid.uuid4())


@pytest_asyncio.fixture
async def tenant_admin(client: AsyncClient, super_admin) -> _TenantAdmin:
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "trash")
    return _TenantAdmin(client=client, headers=headers)


@pytest.mark.asyncio
async def test_hard_delete_user_removes_from_trash_and_db(client: AsyncClient, tenant_admin):
    """A hard-deleted user disappears from the trash and from the DB."""
    from sqlalchemy import select

    from app.db.session import SessionFactory, _set_tenant

    user_id = (await tenant_admin._create_user("Siswa Trash", "s-trash")).id

    # Soft-delete → user enters trash.
    await client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        headers=tenant_admin.headers,
    )

    # Verify it's in trash.
    resp = await client.get("/api/v1/users/trash", headers=tenant_admin.headers)
    trash_ids = [u["id"] for u in resp.json()["data"]]
    assert user_id in trash_ids

    # Hard-delete.
    resp = await client.request(
        "DELETE",
        f"/api/v1/trash/users/{user_id}",
        headers=tenant_admin.headers,
    )
    assert resp.status_code == 204, resp.text

    # No longer in trash.
    resp = await client.get("/api/v1/users/trash", headers=tenant_admin.headers)
    assert user_id not in [u["id"] for u in resp.json()["data"]]

    # Gone from DB.
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        row = (await s.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        assert row is None


@pytest.mark.asyncio
async def test_hard_delete_user_404_on_restored_entity(client: AsyncClient, tenant_admin):
    """Hard-deleting a row that is already restored must not succeed silently."""
    user_id = (await tenant_admin._create_user("Siswa Restored", "s-restored")).id

    # Restore → hard delete now.
    await client.request(
        "POST",
        f"/api/v1/users/{user_id}/restore",
        headers=tenant_admin.headers,
    )
    resp = await client.request(
        "DELETE",
        f"/api/v1/trash/users/{user_id}",
        headers=tenant_admin.headers,
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_hard_delete_user_404_on_nonexistent_entity(client: AsyncClient, tenant_admin):
    """Hard-deleting an ID that never existed must 404, not 204."""
    resp = await client.request(
        "DELETE",
        f"/api/v1/trash/users/{tenant_admin._uuid()}",
        headers=tenant_admin.headers,
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_hard_delete_device_removes_from_trash(client: AsyncClient, tenant_admin):
    """A hard-deleted device disappears from the trash."""
    from sqlalchemy import select

    from app.db.session import SessionFactory, _set_tenant

    device_id = (await tenant_admin._create_device("TrashKiosk")).id

    # Soft-delete → enter trash.
    await client.request(
        "DELETE",
        f"/api/v1/devices/{device_id}",
        headers=tenant_admin.headers,
    )

    resp = await client.request(
        "DELETE",
        f"/api/v1/trash/devices/{device_id}",
        headers=tenant_admin.headers,
    )
    assert resp.status_code == 204, resp.text

    # Gone.
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        row = (await s.execute(select(Device).where(Device.id == device_id))).scalar_one_or_none()
        assert row is None


@pytest.mark.asyncio
async def test_hard_delete_schedule_removes_from_trash(client: AsyncClient, tenant_admin):
    """A hard-deleted schedule disappears from the trash."""
    from sqlalchemy import select

    from app.db.session import SessionFactory, _set_tenant

    # Create a schedule via the normal flow then soft-delete it.
    # For simplicity we create and immediately soft-delete a schedule row.
    schedule_id = (await tenant_admin._create_schedule("TrashSchedule")).id

    await client.request(
        "DELETE",
        f"/api/v1/schedules/{schedule_id}",
        headers=tenant_admin.headers,
    )

    resp = await client.request(
        "DELETE",
        f"/api/v1/trash/schedules/{schedule_id}",
        headers=tenant_admin.headers,
    )
    assert resp.status_code == 204, resp.text

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        row = (
            await s.execute(select(Schedule).where(Schedule.id == schedule_id))
        ).scalar_one_or_none()
        assert row is None


@pytest.mark.asyncio
async def test_hard_delete_is_audit_logged(client: AsyncClient, tenant_admin):
    """Hard-delete must be recorded in the audit log with action trash.hard_deleted."""
    from sqlalchemy import select

    from app.db.session import SessionFactory, _set_tenant
    from app.models import AuditLog

    user_id = (await tenant_admin._create_user("Siswa Audit", "s-audit")).id

    await client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        headers=tenant_admin.headers,
    )
    resp = await client.request(
        "DELETE",
        f"/api/v1/trash/users/{user_id}",
        headers=tenant_admin.headers,
    )
    assert resp.status_code == 204, resp.text

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        log_rows = list(
            (
                await s.execute(select(AuditLog).where(AuditLog.action == "trash.hard_deleted"))
            ).scalars()
        )
        assert len(log_rows) == 1
        assert log_rows[0].detail["entity_type"] == "user"
        assert log_rows[0].detail["entity_id"] == user_id


@pytest.mark.asyncio
async def test_soft_delete_service_hard_delete_removes_row():
    """The service function itself correctly removes a row by ID."""
    from sqlalchemy import select

    from app.db.session import SessionFactory, _set_tenant

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        # Create a test entity in a throwaway way — directly insert.
        from datetime import UTC, datetime

        tenant = Tenant(name="Trash Svc", slug="trash-svc")
        s.add(tenant)
        await s.flush()
        user = User(
            tenant_id=tenant.id,
            full_name="Service Test",
            role="end_user",
            deleted_at=datetime.now(UTC),
        )
        s.add(user)
        await s.flush()
        uid = user.id
        await s.commit()

        # The service function should remove it.
        async with SessionFactory() as s2:
            await _set_tenant(s2, None, platform=True)
            removed = await hard_delete(s2, User, uid)
            assert removed is True

            row = (await s2.execute(select(User).where(User.id == uid))).scalar_one_or_none()
            assert row is None


@pytest.mark.asyncio
async def test_soft_delete_service_hard_delete_returns_false_for_nonexistent():
    """The service function returns False when no row matches."""
    from app.db.session import SessionFactory, _set_tenant
    from app.services.soft_delete import hard_delete

    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        result = await hard_delete(s, User, "00000000-0000-0000-0000-000000009999")
        assert result is False
