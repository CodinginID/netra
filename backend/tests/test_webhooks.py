"""Webhook registration + HMAC-signed dispatch on attendance events."""

from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from app.services import webhook_service

ALICE_FACE = b"face::alice::v1"


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _onboard(client: AsyncClient, owner_hdr: dict, slug: str) -> dict:
    resp = await client.post(
        "/api/v1/tenants",
        headers=owner_hdr,
        json={
            "name": f"Sekolah {slug}",
            "slug": slug,
            "admin_username": f"admin-{slug}",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin",
        },
    )
    assert resp.status_code == 201, resp.text
    admin = await _token(
        client, username=f"admin-{slug}", password="adminpass123", tenant_slug=slug
    )
    return {"Authorization": f"Bearer {admin}"}


@pytest.mark.asyncio
async def test_register_webhook_returns_secret_once(client: AsyncClient, super_admin):
    owner = await _token(client, username="owner", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "wh-a")

    resp = await client.post(
        "/api/v1/webhooks",
        headers=hdr,
        json={"url": "https://hooks.example.com/netra", "events": ["attendance.check_in"]},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["secret"] and len(data["secret"]) > 20
    assert data["events"] == ["attendance.check_in"]

    # List does not leak the secret.
    listed = (await client.get("/api/v1/webhooks", headers=hdr)).json()["data"]
    assert len(listed) == 1
    assert "secret" not in listed[0]


@pytest.mark.asyncio
async def test_attendance_event_dispatches_signed_webhook(
    client: AsyncClient, super_admin, monkeypatch
):
    owner = await _token(client, username="owner", password="ownerpass123")
    hdr = await _onboard(client, {"Authorization": f"Bearer {owner}"}, "wh-b")

    # Enroll Alice.
    alice = (
        await client.post(
            "/api/v1/users",
            headers=hdr,
            json={"full_name": "Alice", "role": "end_user", "username": "alice"},
        )
    ).json()["data"]["id"]
    await client.post("/api/v1/consents", headers=hdr, json={"user_id": alice, "granted": True})
    assert (
        await client.post(
            "/api/v1/enrollment",
            headers=hdr,
            data={"user_id": alice},
            files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
        )
    ).status_code == 201

    # Subscribe to check_in only.
    reg = await client.post(
        "/api/v1/webhooks",
        headers=hdr,
        json={"url": "https://hooks.example.com/x", "events": ["attendance.check_in"]},
    )
    secret = reg.json()["data"]["secret"]

    # Capture deliveries instead of hitting the network.
    sent: list[dict] = []

    async def _capture(url: str, body: bytes, signature: str) -> None:
        sent.append({"url": url, "body": body, "signature": signature})

    monkeypatch.setattr(webhook_service, "send", _capture)

    device = (await client.post("/api/v1/devices", headers=hdr, json={"name": "K"})).json()["data"][
        "token"
    ]

    # check_in -> one delivery, correctly signed.
    ci = await client.post(
        "/api/v1/attendance/checkin",
        headers={"X-Device-Token": device},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert ci.status_code == 200, ci.text
    assert len(sent) == 1
    assert sent[0]["url"] == "https://hooks.example.com/x"
    assert sent[0]["signature"] == webhook_service.sign(secret, sent[0]["body"])
    body = json.loads(sent[0]["body"])
    assert body["event"] == "attendance.check_in"
    assert body["data"]["user_id"] == alice

    # check_out -> NOT subscribed, so no extra delivery.
    await client.post(
        "/api/v1/attendance/checkout",
        headers={"X-Device-Token": device},
        files={"image": ("a.jpg", ALICE_FACE, "image/jpeg")},
    )
    assert len(sent) == 1
