"""Outbound attendance webhooks: registration + HMAC-signed dispatch.

Dispatch is best-effort — a slow or failing subscriber must never break a
kiosk punch. The actual HTTP send goes through the module-level ``send``
callable so tests can substitute a capture without real network traffic. A
durable retry queue is a later refinement (events are also in the audit log).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import WebhookEndpoint

log = get_logger("netra.webhook")

_TIMEOUT = 5.0


def sign(secret: str, body: bytes) -> str:
    """HMAC-SHA256 hex signature of the raw body (subscriber verifies this)."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def send(url: str, body: bytes, signature: str) -> None:  # pragma: no cover - network
    """Real HTTP delivery. Overridable in tests."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        await client.post(
            url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Netra-Signature": f"sha256={signature}",
            },
        )


def generate_secret() -> str:
    return secrets.token_urlsafe(32)


async def register(
    session: AsyncSession, tenant_id: str, *, url: str, events: list[str], secret: str
) -> WebhookEndpoint:
    endpoint = WebhookEndpoint(
        tenant_id=tenant_id, url=url, events=events, secret=secret, is_enabled=True
    )
    session.add(endpoint)
    await session.flush()
    return endpoint


async def list_endpoints(session: AsyncSession, tenant_id: str) -> list[WebhookEndpoint]:
    return list(
        (
            await session.execute(
                select(WebhookEndpoint).where(
                    WebhookEndpoint.tenant_id == tenant_id
                ).order_by(WebhookEndpoint.created_at.desc())
            )
        ).scalars()
    )


async def dispatch(session: AsyncSession, tenant_id: str, *, event: str, payload: dict) -> int:
    """Deliver ``event`` to every enabled endpoint subscribed to it.

    Returns the number of endpoints attempted. Never raises — delivery errors
    are logged and swallowed so attendance recording is unaffected.
    """
    endpoints = (
        await session.execute(
            select(WebhookEndpoint).where(
                WebhookEndpoint.is_enabled.is_(True),
                WebhookEndpoint.tenant_id == tenant_id,
            )
        )
    ).scalars()
    body = json.dumps({"event": event, "data": payload}, separators=(",", ":")).encode()

    attempted = 0
    for ep in endpoints:
        if event not in (ep.events or []):
            continue
        attempted += 1
        try:
            await send(ep.url, body, sign(ep.secret, body))
        except Exception as exc:  # noqa: BLE001 - best-effort delivery
            log.warning(
                "webhook_delivery_failed", url=ep.url, subscribed_event=event, error=str(exc)
            )
    return attempted
