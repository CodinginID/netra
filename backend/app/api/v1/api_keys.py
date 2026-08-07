"""Tenant API key management (dashboard, JWT-authenticated).

Tenant admins generate/rotate/revoke keys here; the keys themselves are used on
the separate /integration endpoints for server-to-server data pulls.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.schemas import (
    API_SCOPES,
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyOut,
    ApiKeyUpdate,
    Envelope,
)
from app.services import api_key_service, audit_service

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _created(key, plaintext: str) -> ApiKeyCreated:
    return ApiKeyCreated.model_validate(
        {**ApiKeyOut.model_validate(key).model_dump(), "key": plaintext}
    )


@router.get("/scopes", response_model=Envelope[dict])
async def list_scopes(_: Principal = Depends(require_tenant_admin)) -> Envelope[dict]:
    """Available scopes (name → human description) for the key-creation UI."""
    return Envelope(data=API_SCOPES)


@router.post("", response_model=Envelope[ApiKeyCreated], status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[ApiKeyCreated]:
    if principal.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required")
    key, plaintext = await api_key_service.create(
        session,
        principal.tenant_id,
        name=payload.name,
        scopes=payload.scopes,
        expires_in_days=payload.expires_in_days,
        allowed_origins=payload.allowed_origins,
    )
    await audit_service.record(
        session,
        action="api_key.created",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"api_key_id": key.id, "scopes": payload.scopes},
    )
    return Envelope(data=_created(key, plaintext))


@router.get("", response_model=Envelope[list[ApiKeyOut]])
async def list_api_keys(
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[ApiKeyOut]]:
    keys = await api_key_service.list_keys(session, principal.tenant_id)
    return Envelope(data=[ApiKeyOut.model_validate(k) for k in keys])


@router.patch("/{key_id}", response_model=Envelope[ApiKeyOut])
async def update_api_key(
    key_id: str,
    payload: ApiKeyUpdate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[ApiKeyOut]:
    """Edit a key's embed origin allowlist without rotating its secret."""
    key = await api_key_service.get(session, key_id)
    if key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    key = await api_key_service.update_origins(session, key, payload.allowed_origins)
    await audit_service.record(
        session,
        action="api_key.origins_updated",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"api_key_id": key.id, "allowed_origins": payload.allowed_origins},
    )
    return Envelope(data=ApiKeyOut.model_validate(key))


@router.post("/{key_id}/rotate", response_model=Envelope[ApiKeyCreated])
async def rotate_api_key(
    key_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[ApiKeyCreated]:
    key = await api_key_service.get(session, key_id)
    if key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    plaintext = await api_key_service.rotate(session, key)
    await audit_service.record(
        session,
        action="api_key.rotated",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"api_key_id": key.id},
    )
    return Envelope(data=_created(key, plaintext))


@router.post("/{key_id}/revoke", response_model=Envelope[ApiKeyOut])
async def revoke_api_key(
    key_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[ApiKeyOut]:
    key = await api_key_service.get(session, key_id)
    if key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    key = await api_key_service.revoke(session, key)
    await audit_service.record(
        session,
        action="api_key.revoked",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"api_key_id": key.id},
    )
    return Envelope(data=ApiKeyOut.model_validate(key))


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    key = await api_key_service.get(session, key_id)
    if key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    await api_key_service.delete(session, key)
    await audit_service.record(
        session,
        action="api_key.deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"api_key_id": key_id},
    )
