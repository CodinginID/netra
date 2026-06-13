"""Tenant management router (Super Admin)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db_unscoped, require_super_admin
from app.models import TenantStatus
from app.schemas import Envelope, TenantCreate, TenantOut
from app.services import audit_service, tenant_service

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post("", response_model=Envelope[TenantOut], status_code=status.HTTP_201_CREATED)
async def create_tenant(
    payload: TenantCreate,
    principal: Principal = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[TenantOut]:
    try:
        tenant = await tenant_service.create_tenant(session, payload)
    except tenant_service.TenantError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await audit_service.record(
        session, action="tenant.created", actor=principal.subject,
        tenant_id=tenant.id, detail={"slug": tenant.slug},
    )
    return Envelope(data=TenantOut.model_validate(tenant))


@router.get("", response_model=Envelope[list[TenantOut]])
async def list_tenants(
    _: Principal = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[list[TenantOut]]:
    tenants = await tenant_service.list_tenants(session)
    return Envelope(data=[TenantOut.model_validate(t) for t in tenants])


@router.post("/{tenant_id}/suspend", response_model=Envelope[TenantOut])
async def suspend_tenant(
    tenant_id: str,
    principal: Principal = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[TenantOut]:
    return await _set_status(session, tenant_id, TenantStatus.suspended, principal)


@router.post("/{tenant_id}/activate", response_model=Envelope[TenantOut])
async def activate_tenant(
    tenant_id: str,
    principal: Principal = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[TenantOut]:
    return await _set_status(session, tenant_id, TenantStatus.active, principal)


async def _set_status(
    session: AsyncSession, tenant_id: str, new_status: TenantStatus, principal: Principal
) -> Envelope[TenantOut]:
    try:
        tenant = await tenant_service.set_status(session, tenant_id, new_status)
    except tenant_service.TenantError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await audit_service.record(
        session, action=f"tenant.{new_status.value}", actor=principal.subject,
        tenant_id=tenant.id, detail={},
    )
    return Envelope(data=TenantOut.model_validate(tenant))
