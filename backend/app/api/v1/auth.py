"""Auth router: internal login → JWT."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_unscoped
from app.models import User
from app.schemas import Envelope, LoginRequest, TokenResponse, UsernameCheckRequest, UsernameCheckResponse
from app.services import audit_service, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/check-username", response_model=Envelope[UsernameCheckResponse])
async def check_username(
    payload: UsernameCheckRequest, session: AsyncSession = Depends(get_db_unscoped)
) -> Envelope[UsernameCheckResponse]:
    result = await session.execute(
        select(User.id).where(User.username == payload.username).limit(1)
    )
    return Envelope(data=UsernameCheckResponse(exists=result.first() is not None))


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
            session,
            action="login.failed",
            actor=payload.username,
            tenant_id=None,
            detail={"tenant_slug": payload.tenant_slug},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await audit_service.record(
        session,
        action="login.success",
        actor=payload.username,
        tenant_id=None,
        detail={"tenant_slug": payload.tenant_slug},
    )
    return Envelope(data=tokens)
