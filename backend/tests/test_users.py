"""Re-adding a deleted user revives their record instead of colliding with it.

Soft delete only stamps ``deleted_at``: the row keeps its external_id, username
and email, and the unique constraints keep covering them. Adding that person
again used to fail with a duplicate error naming a record no listing shows.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _tenant_admin_headers(client: AsyncClient, slug: str) -> dict[str, str]:
    """Onboard a tenant and return headers for its Tenant Admin."""
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {owner}"},
        json={
            "name": f"Sekolah {slug}",
            "slug": slug,
            "admin_email": f"admin@{slug}.app",
            "admin_password": "adminpass123",
            "admin_full_name": f"Admin {slug}",
        },
    )
    assert resp.status_code == 201, resp.text
    admin = await _token(client, email=f"admin@{slug}.app", password="adminpass123")
    return {"Authorization": f"Bearer {admin}"}


async def _create_user(client: AsyncClient, headers: dict[str, str], **payload) -> dict:
    resp = await client.post("/api/v1/users", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


@pytest.mark.asyncio
async def test_readding_deleted_end_user_revives_the_same_record(
    client: AsyncClient, super_admin
):
    headers = await _tenant_admin_headers(client, "revive-end-user")
    created = await _create_user(
        client, headers, full_name="Siswa Satu", role="end_user", external_id="NIS-1"
    )

    removed = await client.delete(f"/api/v1/users/{created['id']}", headers=headers)
    assert removed.status_code == 204, removed.text

    # Same NIS, corrected name — the deleted row comes back rather than a 409.
    again = await _create_user(
        client, headers, full_name="Siswa Satu Baru", role="end_user", external_id="NIS-1"
    )
    assert again["id"] == created["id"]
    assert again["full_name"] == "Siswa Satu Baru"
    # Flagged, so the UI can say "restored" rather than "added".
    assert again["revived"] is True
    assert created["revived"] is False

    listing = await client.get("/api/v1/users", headers=headers)
    assert listing.status_code == 200, listing.text
    items = listing.json()["data"]["items"]
    assert [u["id"] for u in items if u["id"] == created["id"]] == [created["id"]]

    trash = await client.get("/api/v1/users/trash", headers=headers)
    assert trash.status_code == 200, trash.text
    assert trash.json()["data"] == []


@pytest.mark.asyncio
async def test_readding_deleted_staff_replaces_the_old_credential(
    client: AsyncClient, super_admin
):
    """A revived staff account must not still accept the password it had before."""
    headers = await _tenant_admin_headers(client, "revive-staff")
    created = await _create_user(
        client,
        headers,
        full_name="Supervisor Lama",
        role="supervisor",
        email="spv@revive-staff.app",
        password="oldpassword123",
    )
    removed = await client.delete(f"/api/v1/users/{created['id']}", headers=headers)
    assert removed.status_code == 204, removed.text

    again = await _create_user(
        client,
        headers,
        full_name="Supervisor Baru",
        role="supervisor",
        email="spv@revive-staff.app",
        password="newpassword123",
    )
    assert again["id"] == created["id"]

    stale = await client.post(
        "/api/v1/auth/login",
        json={"email": "spv@revive-staff.app", "password": "oldpassword123"},
    )
    assert stale.status_code == 401, stale.text
    await _token(client, email="spv@revive-staff.app", password="newpassword123")


@pytest.mark.asyncio
async def test_duplicate_of_a_live_user_still_conflicts(client: AsyncClient, super_admin):
    """Reviving is only for deleted rows — an active duplicate is still a 409."""
    headers = await _tenant_admin_headers(client, "revive-live-dupe")
    await _create_user(
        client, headers, full_name="Siswa Satu", role="end_user", external_id="NIS-9"
    )

    resp = await client.post(
        "/api/v1/users",
        headers=headers,
        json={"full_name": "Siswa Lain", "role": "end_user", "external_id": "NIS-9"},
    )
    assert resp.status_code == 409, resp.text


@pytest.mark.asyncio
async def test_identifiers_spanning_two_deleted_users_are_refused(
    client: AsyncClient, super_admin
):
    """Reviving here would merge two people into one record, so it must refuse."""
    headers = await _tenant_admin_headers(client, "revive-ambiguous")
    first = await _create_user(
        client,
        headers,
        full_name="Siswa Satu",
        role="end_user",
        external_id="NIS-A",
        username="siswa-satu",
    )
    second = await _create_user(
        client,
        headers,
        full_name="Siswa Dua",
        role="end_user",
        external_id="NIS-B",
        username="siswa-dua",
    )
    for user_id in (first["id"], second["id"]):
        removed = await client.delete(f"/api/v1/users/{user_id}", headers=headers)
        assert removed.status_code == 204, removed.text

    resp = await client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "full_name": "Siswa Campur",
            "role": "end_user",
            "external_id": "NIS-A",
            "username": "siswa-dua",
        },
    )
    assert resp.status_code == 409, resp.text
    assert "trash" in resp.json()["error"].lower()
