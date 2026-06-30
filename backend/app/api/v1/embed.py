"""Embed API — render netra enrollment inside a tenant's own app.

Authenticated by a one-time embed session token (``X-Embed-Token``), NOT a JWT
or API key. The token is minted via POST /integration/embed-sessions.

Note (§6.10): the chromeless HTML page itself is served by the frontend SPA at
/embed/enroll. Setting CSP `frame-ancestors` per-tenant is a prod-serving
concern (Q8) handled by the SPA host / proxy; these are the data endpoints.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import EmbedPrincipal, get_embed_db, get_embed_principal
from app.core.logging import get_logger
from app.models import Consent, EmbedSession
from app.schemas import EmbedSessionInfo, EnrollmentResult, Envelope
from app.services import (
    audit_service,
    embed_session_service,
    recognition_service,
    user_service,
    webhook_service,
)
from app.services.face import NoFaceDetectedError

router = APIRouter(prefix="/embed", tags=["embed"])
log = get_logger("netra.embed")


@router.get("/session", response_model=Envelope[EmbedSessionInfo])
async def session_info(
    principal: EmbedPrincipal = Depends(get_embed_principal),
) -> Envelope[EmbedSessionInfo]:
    """Bootstrap context for the embed page (no secret)."""
    return Envelope(
        data=EmbedSessionInfo(
            purpose=principal.purpose,
            external_id=principal.external_id,
            full_name=principal.full_name,
            is_minor=principal.is_minor,
            return_origin=principal.return_origin,
        )
    )


@router.post("/enroll", response_model=Envelope[EnrollmentResult], status_code=status.HTTP_201_CREATED)
async def embed_enroll(
    images: list[UploadFile] = File(...),
    consent: bool = Form(False),
    guardian_name: str | None = Form(default=None),
    principal: EmbedPrincipal = Depends(get_embed_principal),
    session: AsyncSession = Depends(get_embed_db),
) -> Envelope[EnrollmentResult]:
    if principal.purpose != "enroll":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not for enrollment")
    if not images or len(images) > 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Provide 1–3 face images"
        )
    if not consent:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Biometric consent required")
    if principal.is_minor and not (guardian_name and guardian_name.strip()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Guardian name is required to enroll a minor",
        )
    if not principal.external_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session missing external_id"
        )

    # Resolve or provision the end-user.
    try:
        user = await user_service.get_or_provision_end_user(
            session,
            principal.tenant_id,
            external_id=principal.external_id,
            full_name=principal.full_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    # Record consent BEFORE enroll (enroll_multi requires an existing grant).
    session.add(
        Consent(
            tenant_id=principal.tenant_id,
            user_id=user.id,
            granted=True,
            purpose="biometric_attendance",
            guardian_name=guardian_name.strip() if guardian_name else None,
            granted_at=datetime.now(UTC),
        )
    )
    await session.flush()

    image_bytes = [await img.read() for img in images]
    try:
        embeddings = await recognition_service.enroll_multi(
            session, principal.tenant_id, user.id, image_bytes
        )
    except recognition_service.ConsentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except recognition_service.RecognitionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoFaceDetectedError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    # Single-use: consume the embed session.
    embed = (
        await session.execute(select(EmbedSession).where(EmbedSession.id == principal.session_id))
    ).scalar_one_or_none()
    if embed is not None:
        await embed_session_service.consume(session, embed)

    await audit_service.record(
        session,
        action="face.enrolled_embed",
        actor=f"embed:{principal.session_id}",
        tenant_id=principal.tenant_id,
        detail={"user_id": user.id, "angle_count": len(embeddings)},
    )

    # Push to the client's webhook subscribers (§5.1 sync).
    try:
        await webhook_service.dispatch(
            session,
            principal.tenant_id,
            event="enrollment.completed",
            payload={
                "user_id": user.id,
                "external_id": principal.external_id,
                "full_name": user.full_name,
                "enrolled": True,
            },
        )
    except Exception:
        log.exception("embed_enroll_webhook_failed")

    return Envelope(
        data=EnrollmentResult(user_id=user.id, embedding_id=embeddings[0].id, enrolled=True)
    )
