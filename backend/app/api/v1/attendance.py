"""Attendance check-in / check-out via face recognition (kiosk) + reporting."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    Principal,
    get_db,
    get_device_db,
    get_device_principal,
    require_staff,
)
from app.models import AttendanceType, User
from app.schemas import AttendanceOut, AttendanceResult, Envelope
from app.services import attendance_service, audit_service, recognition_service, schedule_service
from app.services.face import NoFaceDetectedError

router = APIRouter(prefix="/attendance", tags=["attendance"])


async def _capture(
    att_type: AttendanceType,
    image: UploadFile,
    occurred_at: datetime | None,
    liveness_score: float | None,
    principal: Principal,
    session: AsyncSession,
) -> Envelope[AttendanceResult]:
    if principal.tenant_id is None:  # kiosk principals always carry a tenant; guard for typing
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    image_bytes = await image.read()
    try:
        match = await recognition_service.identify(session, image_bytes)
    except NoFaceDetectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face not recognized")

    user = (
        await session.execute(select(User).where(User.id == match.user_id))
    ).scalar_one_or_none()
    if user is None:  # embedding without a user — data integrity guard
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    schedule = await schedule_service.get_default_schedule(session)
    rec = await attendance_service.record(
        session,
        principal.tenant_id,
        match.user_id,
        att_type=att_type,
        occurred_at=occurred_at or datetime.now(UTC),
        schedule=schedule,
        liveness_score=liveness_score,
        device_id=principal.subject,
    )
    await audit_service.record(
        session,
        action=f"attendance.{att_type.value}",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": match.user_id, "status": rec.status.value},
    )
    return Envelope(
        data=AttendanceResult(
            user_id=match.user_id,
            full_name=user.full_name,
            similarity=round(match.similarity, 4),
            attendance=AttendanceOut.model_validate(rec),
        )
    )


@router.post("/checkin", response_model=Envelope[AttendanceResult])
async def check_in(
    image: UploadFile = File(...),
    occurred_at: datetime | None = Form(default=None),
    liveness_score: float | None = Form(default=None),
    principal: Principal = Depends(get_device_principal),
    session: AsyncSession = Depends(get_device_db),
) -> Envelope[AttendanceResult]:
    return await _capture(
        AttendanceType.check_in, image, occurred_at, liveness_score, principal, session
    )


@router.post("/checkout", response_model=Envelope[AttendanceResult])
async def check_out(
    image: UploadFile = File(...),
    occurred_at: datetime | None = Form(default=None),
    liveness_score: float | None = Form(default=None),
    principal: Principal = Depends(get_device_principal),
    session: AsyncSession = Depends(get_device_db),
) -> Envelope[AttendanceResult]:
    return await _capture(
        AttendanceType.check_out, image, occurred_at, liveness_score, principal, session
    )


@router.get("", response_model=Envelope[list[AttendanceOut]])
async def list_attendance(
    user_id: str | None = None,
    _: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[AttendanceOut]]:
    records = await attendance_service.list_records(session, user_id=user_id)
    return Envelope(data=[AttendanceOut.model_validate(r) for r in records])
