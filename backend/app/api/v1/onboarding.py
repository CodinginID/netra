"""Onboarding flow endpoints — guide new tenants through initial setup."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.schemas import Envelope
from app.services import audit_service

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/status", response_model=Envelope[dict])
async def get_onboarding_status(
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    """Return onboarding progress for the current tenant."""
    if principal.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required")

    from app.services.tenant_service import get_tenant
    tenant = await get_tenant(session, principal.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    completed = tenant.onboarding_completed_at is not None
    config = tenant.config or {}
    attendance_cfg = config.get("attendance", {})
    kiosk_cfg = config.get("kiosk", {})

    # Check what steps are done
    has_schedule = bool(attendance_cfg.get("workday_start") or attendance_cfg.get("workday_end"))
    has_kiosk_pref = bool(kiosk_cfg.get("require_liveness") is not None)

    return Envelope(data={
        "completed": completed,
        "steps": {
            "welcome": True,  # always done once wizard opens
            "schedule": has_schedule,
            "device": False,  # checked via separate endpoint
            "users": False,   # checked via separate endpoint
            "test": False,    # only set after completing wizard
        }
    })


@router.post("/complete", response_model=Envelope[dict])
async def complete_onboarding(
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    """Mark onboarding as complete."""
    if principal.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required")

    from app.services.tenant_service import get_tenant, update_config
    tenant = await get_tenant(session, principal.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    tenant.onboarding_completed_at = datetime.now(UTC)
    await session.flush()

    await audit_service.record(
        session, action="onboarding.completed", actor=principal.subject,
        tenant_id=principal.tenant_id, detail={"tenant_id": tenant.id},
    )

    return Envelope(data={"completed": True, "completed_at": tenant.onboarding_completed_at.isoformat()})


@router.post("/dismiss", response_model=Envelope[dict])
async def dismiss_onboarding(
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    """Dismiss onboarding banner without completing all steps (set completed_at)."""
    if principal.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required")

    from app.services.tenant_service import get_tenant
    tenant = await get_tenant(session, principal.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    tenant.onboarding_completed_at = datetime.now(UTC)
    await session.flush()

    return Envelope(data={"dismissed": True})
