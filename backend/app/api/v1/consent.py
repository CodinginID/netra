"""Consent router (UU PDP) — capture explicit biometric consent before enrollment."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal
from app.models import Consent, User
from app.schemas import ConsentOut, ConsentRequest, Envelope
from app.services import audit_service

router = APIRouter(prefix="/consents", tags=["consent"])


@router.post("", response_model=Envelope[ConsentOut], status_code=status.HTTP_201_CREATED)
async def grant_consent(
    payload: ConsentRequest,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> Envelope[ConsentOut]:
    """Record explicit biometric consent (with optional guardian for minors)."""
    user = (
        await session.execute(select(User).where(User.id == payload.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    consent = Consent(
        tenant_id=user.tenant_id,
        user_id=user.id,
        granted=payload.granted,
        purpose=payload.purpose,
        guardian_name=payload.guardian_name,
        granted_at=datetime.now(UTC) if payload.granted else None,
    )
    session.add(consent)
    await session.flush()
    await audit_service.record(
        session, action="consent.granted" if payload.granted else "consent.revoked",
        actor=principal.subject, tenant_id=user.tenant_id, detail={"user_id": user.id},
    )
    return Envelope(data=ConsentOut.model_validate(consent))
