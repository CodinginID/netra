"""GET /schedules type filter + per-type counts (server-side, across pages)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.test_devices import _onboard_tenant_admin


@pytest.mark.asyncio
async def test_list_schedules_filters_by_type_with_counts(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    bodies = [
        {"name": "Shift A", "rules": {"type": "shift", "workday_start": "08:00"}},
        {"name": "Legacy", "rules": {"workday_start": "07:00"}},  # no type = shift
        {"name": "Sekolah", "rules": {"type": "session", "sessions": [
            {"name": "Sesi 1", "start": "07:30", "end": "09:00"}]}},
    ]
    for body in bodies:
        resp = await client.post("/api/v1/schedules", headers=headers, json=body)
        assert resp.status_code == 201, resp.text

    async def listing(**params) -> dict:
        resp = await client.get("/api/v1/schedules", headers=headers, params=params)
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]

    everything = await listing()
    assert everything["total"] == 3
    assert everything["counts"] == {"all": 3, "shift": 2, "session": 1}

    shifts = await listing(type="shift", limit=1)
    assert shifts["total"] == 2 and shifts["pages"] == 2
    assert shifts["counts"] == {"all": 3, "shift": 2, "session": 1}  # counts ignore the filter
    page2 = await listing(type="shift", limit=1, page=2)
    names = {shifts["items"][0]["name"], page2["items"][0]["name"]}
    assert names == {"Shift A", "Legacy"}

    sessions = await listing(type="session")
    assert [s["name"] for s in sessions["items"]] == ["Sekolah"]

    bad = await client.get("/api/v1/schedules", headers=headers, params={"type": "nope"})
    assert bad.status_code == 422
