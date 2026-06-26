"""Face enrollment — compute & store a user's biometric embedding.

Requires prior biometric consent (UU PDP); enforced in the service layer.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal, require_staff
from app.core.logging import get_logger
from app.schemas import EnrollmentResult, Envelope
from app.services import audit_service, recognition_service
from app.services.face import NoFaceDetectedError
from app.websocket import manager

log = get_logger("netra.enrollment")

router = APIRouter(prefix="/enrollment", tags=["enrollment"])


@router.post("/self", response_model=Envelope[EnrollmentResult], status_code=status.HTTP_201_CREATED)
async def self_enroll_face(
    image: UploadFile = File(...),
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> Envelope[EnrollmentResult]:
    """Self-service enrollment — any authenticated user can enroll their own face."""
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    user_id = principal.subject
    image_bytes = await image.read()
    try:
        embedding = await recognition_service.enroll(
            session, principal.tenant_id, user_id, image_bytes
        )
    except recognition_service.ConsentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except recognition_service.RecognitionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoFaceDetectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await audit_service.record(
        session,
        action="face.self_enrolled",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id, "embedding_id": embedding.id},
    )

    # Publish WebSocket event (best-effort)
    try:
        await manager.broadcast(
            f"tenant:{principal.tenant_id}",
            {
                "type": "user.enrolled",
                "tenant_id": principal.tenant_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "data": {
                    "user_id": user_id,
                    "angles_count": 1,
                },
            },
        )
    except Exception:
        log.exception("enrollment_event_publish_failed")

    return Envelope(
        data=EnrollmentResult(user_id=user_id, embedding_id=embedding.id, enrolled=True)
    )


@router.post(
    "/self/multi",
    response_model=Envelope[EnrollmentResult],
    status_code=status.HTTP_201_CREATED,
)
async def self_enroll_multi_angle(
    images: list[UploadFile] = File(...),
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> Envelope[EnrollmentResult]:
    """Active enrollment — accepts 1–3 face images (front, left, right angles).
    Replaces all existing embeddings for the user on each call.
    """
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    if not images or len(images) > 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide 1–3 face images",
        )

    user_id = principal.subject
    image_bytes = [await img.read() for img in images]

    try:
        embeddings = await recognition_service.enroll_multi(
            session, principal.tenant_id, user_id, image_bytes
        )
    except recognition_service.ConsentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except recognition_service.RecognitionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoFaceDetectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await audit_service.record(
        session,
        action="face.self_enrolled_multi",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id, "angle_count": len(embeddings)},
    )

    # Publish WebSocket event (best-effort)
    try:
        await manager.broadcast(
            f"tenant:{principal.tenant_id}",
            {
                "type": "user.enrolled",
                "tenant_id": principal.tenant_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "data": {
                    "user_id": user_id,
                    "angles_count": len(embeddings),
                },
            },
        )
    except Exception:
        log.exception("enrollment_event_publish_failed")

    return Envelope(
        data=EnrollmentResult(
            user_id=user_id,
            embedding_id=embeddings[0].id,
            enrolled=True,
        )
    )


@router.post("/multi", response_model=Envelope[EnrollmentResult], status_code=status.HTTP_201_CREATED)
async def enroll_face_multi(
    user_id: str = Form(...),
    images: list[UploadFile] = File(...),
    principal: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[EnrollmentResult]:
    """Admin active enrollment — 1–3 face angles, replaces all existing embeddings."""
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    if not images or len(images) > 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide 1–3 face images",
        )

    image_bytes = [await img.read() for img in images]
    try:
        embeddings = await recognition_service.enroll_multi(
            session, principal.tenant_id, user_id, image_bytes
        )
    except recognition_service.ConsentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except recognition_service.RecognitionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoFaceDetectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await audit_service.record(
        session,
        action="face.enrolled_multi",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id, "angle_count": len(embeddings)},
    )

    # Publish WebSocket event (best-effort)
    try:
        await manager.broadcast(
            f"tenant:{principal.tenant_id}",
            {
                "type": "user.enrolled",
                "tenant_id": principal.tenant_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "data": {
                    "user_id": user_id,
                    "angles_count": len(embeddings),
                },
            },
        )
    except Exception:
        log.exception("enrollment_event_publish_failed")

    return Envelope(
        data=EnrollmentResult(user_id=user_id, embedding_id=embeddings[0].id, enrolled=True)
    )


@router.post("", response_model=Envelope[EnrollmentResult], status_code=status.HTTP_201_CREATED)
async def enroll_face(
    user_id: str = Form(...),
    image: UploadFile = File(...),
    principal: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[EnrollmentResult]:
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    image_bytes = await image.read()
    try:
        embedding = await recognition_service.enroll(
            session, principal.tenant_id, user_id, image_bytes
        )
    except recognition_service.ConsentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except recognition_service.RecognitionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoFaceDetectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await audit_service.record(
        session,
        action="face.enrolled",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id, "embedding_id": embedding.id},
    )

    # Publish WebSocket event (best-effort)
    try:
        await manager.broadcast(
            f"tenant:{principal.tenant_id}",
            {
                "type": "user.enrolled",
                "tenant_id": principal.tenant_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "data": {
                    "user_id": user_id,
                    "angles_count": 1,
                },
            },
        )
    except Exception:
        log.exception("enrollment_event_publish_failed")

    return Envelope(
        data=EnrollmentResult(user_id=user_id, embedding_id=embedding.id, enrolled=True)
    )
