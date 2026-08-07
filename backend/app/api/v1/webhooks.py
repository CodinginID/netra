"""Webhook subscriber management (tenant-scoped via RLS)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.schemas import Envelope, WebhookCreate, WebhookOut, WebhookRegistered
from app.services import audit_service, webhook_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("", response_model=Envelope[WebhookRegistered], status_code=status.HTTP_201_CREATED)
async def register_webhook(
    payload: WebhookCreate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[WebhookRegistered]:
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    secret = webhook_service.generate_secret()
    endpoint = await webhook_service.register(
        session, principal.tenant_id, url=payload.url, events=payload.events, secret=secret
    )
    await audit_service.record(
        session,
        action="webhook.registered",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"webhook_id": endpoint.id, "events": payload.events},
    )
    out = WebhookRegistered.model_validate(endpoint)
    out.secret = secret  # surfaced once
    return Envelope(data=out)


@router.get("", response_model=Envelope[list[WebhookOut]])
async def list_webhooks(
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[WebhookOut]]:
    endpoints = await webhook_service.list_endpoints(session, principal.tenant_id)
    return Envelope(data=[WebhookOut.model_validate(e) for e in endpoints])
