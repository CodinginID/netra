"""A tenant with schedules always has a live default, and punches are judged in tenant time.

Without a default schedule every punch was recorded "on time" (the reported
bug: late check-ins showed as Tepat Waktu).
"""

from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient

from tests.test_devices import _onboard_tenant_admin
from tests.test_recognition import (
    ALICE_FACE,
    _create_user,
    _device_token,
    _grant_consent,
    _onboard,
    _token,
)

SHIFT = {"type": "shift", "workday_start": "08:00", "workday_end": "16:00"}


async def _create(client: AsyncClient, headers: dict, name: str, **extra) -> dict:
    resp = await client.post(
        "/api/v1/schedules", headers=headers, json={"name": name, "rules": SHIFT, **extra}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _schedules(client: AsyncClient, headers: dict) -> dict[str, dict]:
    resp = await client.get("/api/v1/schedules", headers=headers)
    assert resp.status_code == 200, resp.text
    return {s["name"]: s for s in resp.json()["data"]["items"]}


@pytest.mark.asyncio
async def test_first_schedule_becomes_default(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    first = await _create(client, headers, "A")
    assert first["is_default"] is True

    second = await _create(client, headers, "B")
    assert second["is_default"] is False
    assert (await _schedules(client, headers))["A"]["is_default"] is True


@pytest.mark.asyncio
async def test_deleting_default_promotes_another_and_restore_keeps_one(
    client: AsyncClient, super_admin
):
    headers = await _onboard_tenant_admin(client)
    a = await _create(client, headers, "A")
    await _create(client, headers, "B")

    assert (await client.delete(f"/api/v1/schedules/{a['id']}", headers=headers)).status_code == 204
    assert (await _schedules(client, headers))["B"]["is_default"] is True

    restored = await client.post(f"/api/v1/schedules/{a['id']}/restore", headers=headers)
    assert restored.status_code == 200, restored.text
    assert restored.json()["data"]["is_default"] is False
    defaults = [s["name"] for s in (await _schedules(client, headers)).values() if s["is_default"]]
    assert defaults == ["B"]


@pytest.mark.asyncio
async def test_checkin_is_judged_in_tenant_timezone(client: AsyncClient, super_admin):
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "tz-a")
    alice = await _create_user(client, hdr, "Alice", "alice")
    await _grant_consent(client, hdr, alice)
    enrolled = await client.post(
        "/api/v1/enrollment", headers=hdr, data={"user_id": alice},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert enrolled.status_code == 201
    # Not flagged is_default: the first schedule must still be used.
    await _create(client, hdr, "Reguler", grace_minutes=15)

    # 02:00 UTC is 09:00 in Asia/Jakarta (the default tenant timezone): late.
    resp = await client.post(
        "/api/v1/attendance/checkin",
        headers={"X-Device-Token": await _device_token(client, hdr)},
        data={"occurred_at": "2026-06-16T02:00:00Z"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attendance"]["status"] == "late"


@pytest.mark.asyncio
async def test_recompute_script_fixes_punches_stored_without_a_schedule(
    client: AsyncClient, super_admin, capsys
):
    from scripts.recompute_attendance_status import recompute

    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "tz-b")
    alice = await _create_user(client, hdr, "Alice", "alice")
    await _grant_consent(client, hdr, alice)
    await client.post(
        "/api/v1/enrollment", headers=hdr, data={"user_id": alice},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    # No schedule yet: a 09:00 WIB check-in is stored on_time.
    resp = await client.post(
        "/api/v1/attendance/checkin",
        headers={"X-Device-Token": await _device_token(client, hdr)},
        data={"occurred_at": "2026-06-16T09:00:00+07:00"},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert resp.json()["data"]["attendance"]["status"] == "on_time"
    await _create(client, hdr, "Reguler")

    async def stored_status() -> str:
        listing = (await client.get("/api/v1/attendance", headers=hdr)).json()["data"]["items"]
        return listing[0]["status"]

    await recompute("tz-b", date(2026, 6, 16), date(2026, 6, 16), apply=False)
    assert "on_time -> late" in capsys.readouterr().out
    assert await stored_status() == "on_time"

    await recompute("tz-b", date(2026, 6, 16), date(2026, 6, 16), apply=True)
    assert await stored_status() == "late"
