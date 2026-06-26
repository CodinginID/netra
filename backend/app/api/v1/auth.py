"""Auth router: internal login → JWT."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db_unscoped, get_principal
from app.core.ratelimit import login_rate_limit
from app.models import User
from app.schemas import (
    ChangePasswordRequest,
    EmailCheckRequest,
    EmailCheckResponse,
    Envelope,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
)
from app.services import audit_service, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/check-email",
    response_model=Envelope[EmailCheckResponse],
    dependencies=[Depends(login_rate_limit)],
)
async def check_email(
    payload: EmailCheckRequest, session: AsyncSession = Depends(get_db_unscoped)
) -> Envelope[EmailCheckResponse]:
    """Step 1 of login: confirm the email is registered before asking for a password."""
    normalized = payload.email.strip().lower()
    result = await session.execute(select(User.id).where(User.email == normalized).limit(1))
    return Envelope(data=EmailCheckResponse(exists=result.first() is not None))


@router.post(
    "/login",
    response_model=Envelope[TokenResponse],
    dependencies=[Depends(login_rate_limit)],
)
async def login(
    payload: LoginRequest, session: AsyncSession = Depends(get_db_unscoped)
) -> Envelope[TokenResponse]:
    actor = payload.email.strip().lower()
    try:
        tokens = await auth_service.authenticate(
            session,
            email=payload.email,
            password=payload.password,
        )
    except auth_service.AuthError as exc:
        await audit_service.record(
            session,
            action="login.failed",
            actor=actor,
            tenant_id=None,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await audit_service.record(
        session,
        action="login.success",
        actor=actor,
        tenant_id=None,
    )
    return Envelope(data=tokens)


@router.post("/refresh", response_model=Envelope[TokenResponse])
async def refresh(
    payload: RefreshRequest, session: AsyncSession = Depends(get_db_unscoped)
) -> Envelope[TokenResponse]:
    """Exchange a valid refresh token for a fresh access + refresh pair."""
    try:
        tokens = await auth_service.refresh_tokens(session, refresh_token=payload.refresh_token)
    except auth_service.AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return Envelope(data=tokens)


@router.post("/change-password", response_model=Envelope[dict])
async def change_password(
    payload: ChangePasswordRequest,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[dict]:
    """Change the authenticated user's own password (verifies the current one)."""
    try:
        await auth_service.change_password(
            session,
            user_id=principal.subject,
            old_password=payload.old_password,
            new_password=payload.new_password,
        )
    except auth_service.AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await audit_service.record(
        session,
        action="password.changed",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
    )
    return Envelope(data={"changed": True})
