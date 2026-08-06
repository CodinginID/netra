"""GET /embed/frame-origin — read-only token → return_origin lookup used by
the SPA host's reverse proxy (nginx auth_request) to set a per-session
`frame-ancestors` CSP on the embed shell. See docs §6.10."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import hash_embed_token
from app.db.session import SessionFactory, _set_tenant
from app.models import EmbedSession
from app.services import embed_session_service


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _onboard_tenant_admin(client: AsyncClient, slug: str = "acme") -> dict[str, str]:
    owner = await _token(client, email="owner@netra.app", password="ownerpass123")
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {owner}"},
        json={
            "name": f"Tenant {slug}",
            "slug": slug,
            "admin_email": f"admin-{slug}@netra.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin",
        },
    )
    assert resp.status_code == 201, resp.text
    admin = await _token(client, email=f"admin-{slug}@netra.app", password="adminpass123")
    return {"Authorization": f"Bearer {admin}"}


async def _create_key(client: AsyncClient, headers: dict, *, allowed_origins: list[str]) -> dict:
    resp = await client.post(
        "/api/v1/api-keys",
        headers=headers,
        json={"name": "Client App", "scopes": ["embed:enroll"], "allowed_origins": allowed_origins},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _mint(client: AsyncClient, api_key: str, *, return_origin: str) -> dict:
    resp = await client.post(
        "/api/v1/integration/embed-sessions",
        headers={"X-API-Key": api_key},
        json={
            "external_id": "NIS123",
            "full_name": "Budi",
            "return_origin": return_origin,
            "is_minor": False,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _load_embed_session(token: str) -> EmbedSession:
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        embed = (
            await session.execute(
                select(EmbedSession).where(EmbedSession.token_hash == hash_embed_token(token))
            )
        ).scalar_one()
        return embed


@pytest.mark.asyncio
async def test_frame_origin_valid_token_returns_origin_header(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(client, headers, allowed_origins=["https://app.acme.id"])
    minted = await _mint(client, key["key"], return_origin="https://app.acme.id")

    resp = await client.get("/api/v1/embed/frame-origin", params={"token": minted["token"]})

    assert resp.status_code == 204, resp.text
    assert resp.headers["x-frame-origin"] == "https://app.acme.id"


@pytest.mark.asyncio
async def test_frame_origin_rejects_unknown_token(client: AsyncClient, super_admin):
    resp = await client.get("/api/v1/embed/frame-origin", params={"token": "not-a-real-token"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_frame_origin_rejects_missing_token(client: AsyncClient, super_admin):
    resp = await client.get("/api/v1/embed/frame-origin")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_frame_origin_rejects_expired_token(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(client, headers, allowed_origins=["https://app.acme.id"])
    minted = await _mint(client, key["key"], return_origin="https://app.acme.id")

    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        embed = (
            await session.execute(
                select(EmbedSession).where(
                    EmbedSession.token_hash == hash_embed_token(minted["token"])
                )
            )
        ).scalar_one()
        embed.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    resp = await client.get("/api/v1/embed/frame-origin", params={"token": minted["token"]})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_frame_origin_rejects_consumed_token(client: AsyncClient, super_admin):
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(client, headers, allowed_origins=["https://app.acme.id"])
    minted = await _mint(client, key["key"], return_origin="https://app.acme.id")

    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        embed = await embed_session_service.lookup_active(session, minted["token"])
        assert embed is not None
        await embed_session_service.consume(session, embed)
        await session.commit()

    resp = await client.get("/api/v1/embed/frame-origin", params={"token": minted["token"]})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_frame_origin_rejects_malformed_stored_origin(client: AsyncClient, super_admin):
    """Defense-in-depth: even if a malformed/smuggled return_origin somehow
    ends up stored on a session row, /frame-origin must not reflect it into a
    response header — the endpoint re-validates shape at the point it's
    emitted, independent of whatever validation ran when the origin was
    first stored on the API key."""
    headers = await _onboard_tenant_admin(client)
    key = await _create_key(client, headers, allowed_origins=["https://app.acme.id"])
    minted = await _mint(client, key["key"], return_origin="https://app.acme.id")

    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        embed = (
            await session.execute(
                select(EmbedSession).where(
                    EmbedSession.token_hash == hash_embed_token(minted["token"])
                )
            )
        ).scalar_one()
        embed.return_origin = "https://evil.acme.id\r\nX-Injected: 1"
        await session.commit()

    resp = await client.get("/api/v1/embed/frame-origin", params={"token": minted["token"]})
    assert resp.status_code == 401
