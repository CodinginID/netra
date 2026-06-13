"""Auth router: internal login → JWT."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_unscoped
from app.schemas import Envelope, LoginRequest, TokenResponse
from app.services import audit_service, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Envelope[TokenResponse])
async def login(
    payload: LoginRequest, session: AsyncSession = Depends(get_db_unscoped)
) -> Envelope[TokenResponse]:
    try:
        tokens = await auth_service.authenticate(
            session,
            username=payload.username,
            password=payload.password,
            tenant_slug=payload.tenant_slug,
        )
    except auth_service.AuthError as exc:
        await audit_service.record(
            session, action="login.failed", actor=payload.username,
            tenant_id=None, detail={"tenant_slug": payload.tenant_slug},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await audit_service.record(
        session, action="login.success", actor=payload.username,
        tenant_id=None, detail={"tenant_slug": payload.tenant_slug},
    )
    return Envelope(data=tokens)
