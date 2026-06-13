"""Face enrollment — compute & store a user's biometric embedding.

Requires prior biometric consent (UU PDP); enforced in the service layer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_staff
from app.schemas import EnrollmentResult, Envelope
from app.services import audit_service, recognition_service
from app.services.face import NoFaceDetectedError

router = APIRouter(prefix="/enrollment", tags=["enrollment"])


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
    return Envelope(
        data=EnrollmentResult(user_id=user_id, embedding_id=embedding.id, enrolled=True)
    )
