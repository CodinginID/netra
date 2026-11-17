"""POST /tenants/{id}/reset — Super Admin wipes chosen data of one tenant.

Permanent. The tenant, its admins, config, schedules, API keys, webhooks,
billing and audit log stay. The caller must echo the tenant's slug back
(``confirm_slug``) so a reset can't be fired at the wrong tenant by id alone.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db_unscoped, require_super_admin
from app.core.logging import get_logger
from app.schemas import Envelope
from app.services import audit_service, tenant_service
from app.services.tenant_reset_service import ResetCategory, reset_tenant_data
from app.websocket import manager

log = get_logger("netra.tenant_reset")

router = APIRouter(prefix="/tenants", tags=["tenants"])


class TenantResetRequest(BaseModel):
    categories: set[ResetCategory] = Field(min_length=1)
    confirm_slug: str = Field(min_length=1, max_length=255)


class TenantResetResult(BaseModel):
    tenant_id: str
    removed: dict[str, int]


async def _notify(tenant_id: str, categories: list[str]) -> None:
    """Tell open dashboards/kiosks of that tenant to reload (best-effort)."""
    try:
        await manager.broadcast(
            f"tenant:{tenant_id}",
            {
                "type": "tenant.reset",
                "tenant_id": tenant_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "data": {"categories": categories},
            },
        )
    except Exception:
        log.exception("tenant_reset_event_publish_failed")


@router.post("/{tenant_id}/reset", response_model=Envelope[TenantResetResult])
async def reset_tenant(
    tenant_id: str,
    payload: TenantResetRequest,
    principal: Principal = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[TenantResetResult]:
    tenant = await tenant_service.get_tenant(session, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if payload.confirm_slug.strip() != tenant.slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation does not match the tenant slug",
        )

    removed = await reset_tenant_data(session, tenant_id, payload.categories)
    categories = sorted(c.value for c in payload.categories)
    await audit_service.record(
        session,
        action="tenant.reset",
        actor=principal.subject,
        tenant_id=tenant_id,
        detail={"categories": categories, "removed": removed},
    )
    await _notify(tenant_id, categories)
    return Envelope(data=TenantResetResult(tenant_id=tenant_id, removed=removed))
