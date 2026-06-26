"""Attendance check-in / check-out via face recognition (kiosk) + reporting.

Pipeline per punch: liveness (server-side anti-spoofing) -> 1:N identify ->
geofence enforcement -> record with schedule-derived status -> webhook dispatch.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    Principal,
    get_db,
    get_device_db,
    get_device_principal,
    require_staff,
)
from app.core.config import settings
from app.core.logging import get_logger
from app.models import AttendanceRecord, AttendanceType, User
from app.schemas import AttendanceOut, AttendanceResult, Envelope, TenantConfig
from app.services import (
    attendance_service,
    audit_service,
    recognition_service,
    schedule_service,
    tenant_service,
    webhook_service,
)
from app.services.face import NoFaceDetectedError
from app.services.liveness import LivenessError, get_liveness_engine

router = APIRouter(prefix="/attendance", tags=["attendance"])
log = get_logger("netra.attendance")


async def _get_open_checkin(
    session: AsyncSession,
    user_id: str,
    now: datetime,
) -> AttendanceRecord | None:
    """Return the user's last check-in today if no subsequent check-out exists, else None."""
    today_start = datetime(now.year, now.month, now.day, tzinfo=UTC)
    today_end = today_start + timedelta(days=1)

    last_checkin = (
        await session.execute(
            select(AttendanceRecord)
            .where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.type == AttendanceType.check_in,
                AttendanceRecord.occurred_at >= today_start,
                AttendanceRecord.occurred_at < today_end,
            )
            .order_by(AttendanceRecord.occurred_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if last_checkin is None:
        return None

    had_checkout = (
        await session.execute(
            select(AttendanceRecord.id).where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.type == AttendanceType.check_out,
                AttendanceRecord.occurred_at > last_checkin.occurred_at,
            ).limit(1)
        )
    ).scalar_one_or_none()

    return None if had_checkout is not None else last_checkin


async def _capture(
    att_type: AttendanceType,
    image: UploadFile,
    occurred_at: datetime | None,
    lat: float | None,
    lng: float | None,
    principal: Principal,
    session: AsyncSession,
) -> Envelope[AttendanceResult]:
    if principal.tenant_id is None:  # kiosk principals always carry a tenant; guard for typing
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    now = occurred_at or datetime.now(UTC)
    image_bytes = await image.read()

    # Load tenant config first — liveness is only scored when the tenant requires it.
    tenant = await tenant_service.get_tenant(session, principal.tenant_id)
    cfg = TenantConfig.model_validate((tenant.config if tenant else None) or {})

    # 1. Liveness — scored server-side; gated by the tenant's kiosk prefs.
    liveness = 0.0
    if cfg.kiosk.require_liveness:
        try:
            liveness = get_liveness_engine().score(image_bytes)
        except LivenessError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        if liveness < settings.liveness_threshold:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"liveness check failed (score {liveness:.2f})",
            )

    # 2. Identify (1:N, tenant-isolated by RLS; per-tenant threshold if set).
    try:
        match = await recognition_service.identify(
            session, image_bytes, threshold=cfg.recognition.match_threshold
        )
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

    # Duplicate / consistency guard — prevent double check-in or check-out without a pair.
    open_checkin = await _get_open_checkin(session, match.user_id, now)
    if att_type == AttendanceType.check_in and open_checkin is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sudah check-in hari ini, silakan check-out terlebih dahulu",
        )
    if att_type == AttendanceType.check_out and open_checkin is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Belum ada check-in aktif hari ini",
        )

    schedule = await schedule_service.get_default_schedule(session)

    # 3. Geofence enforcement (if the schedule defines one).
    location = {"lat": lat, "lng": lng} if lat is not None and lng is not None else None
    try:
        attendance_service.enforce_geofence(schedule, location)
    except attendance_service.GeofenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    # 4. Record.
    rec = await attendance_service.record(
        session,
        principal.tenant_id,
        match.user_id,
        att_type=att_type,
        occurred_at=now,
        schedule=schedule,
        location=location,
        liveness_score=liveness,
        device_id=principal.subject,
    )
    await audit_service.record(
        session,
        action=f"attendance.{att_type.value}",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": match.user_id, "status": rec.status.value},
    )

    # 5. Fire-and-forget webhook dispatch to the tenant's subscribers.
    await webhook_service.dispatch(
        session,
        principal.tenant_id,
        event=f"attendance.{att_type.value}",
        payload={
            "user_id": match.user_id,
            "full_name": user.full_name,
            "type": att_type.value,
            "status": rec.status.value,
            "occurred_at": rec.occurred_at.isoformat(),
            "liveness_score": liveness,
        },
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
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
    principal: Principal = Depends(get_device_principal),
    session: AsyncSession = Depends(get_device_db),
) -> Envelope[AttendanceResult]:
    return await _capture(AttendanceType.check_in, image, occurred_at, lat, lng, principal, session)


@router.post("/checkout", response_model=Envelope[AttendanceResult])
async def check_out(
    image: UploadFile = File(...),
    occurred_at: datetime | None = Form(default=None),
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
    principal: Principal = Depends(get_device_principal),
    session: AsyncSession = Depends(get_device_db),
) -> Envelope[AttendanceResult]:
    return await _capture(
        AttendanceType.check_out, image, occurred_at, lat, lng, principal, session
    )


@router.post("/auto", response_model=Envelope[AttendanceResult])
async def auto_attend(
    image: UploadFile = File(...),
    occurred_at: datetime | None = Form(default=None),
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
    principal: Principal = Depends(get_device_principal),
    session: AsyncSession = Depends(get_device_db),
) -> Envelope[AttendanceResult]:
    """Touchless attendance: auto-determines check-in vs check-out from today's DB history."""
    log.info(
        "auto_attend_incoming",
        image_filename=image.filename,
        image_content_type=image.content_type,
        occurred_at=str(occurred_at) if occurred_at else None,
        lat=lat,
        lng=lng,
    )
    if principal.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required")

    now = occurred_at or datetime.now(UTC)
    image_bytes = await image.read()

    tenant = await tenant_service.get_tenant(session, principal.tenant_id)
    cfg = TenantConfig.model_validate((tenant.config if tenant else None) or {})

    log.info(
        "auto_attend_image_received",
        image_bytes_len=len(image_bytes),
        image_bytes_preview=image_bytes[:20].hex() if image_bytes else "empty",
        liveness_engine=settings.liveness_engine,
        require_liveness=cfg.kiosk.require_liveness,
        liveness_threshold=settings.liveness_threshold,
    )

    # 1. Liveness — only scored when the tenant requires it
    liveness = 0.0
    if cfg.kiosk.require_liveness:
        try:
            liveness = get_liveness_engine().score(image_bytes)
        except LivenessError as exc:
            log.error("auto_attend_liveness_error", error=str(exc), error_type=type(exc).__name__)
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        log.info("auto_attend_liveness_score", score=liveness)
        if liveness < settings.liveness_threshold:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"liveness check failed (score {liveness:.2f})",
            )

    # 2. Identify (1:N)
    try:
        match = await recognition_service.identify(session, image_bytes, threshold=cfg.recognition.match_threshold)
    except NoFaceDetectedError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face not recognized")

    user = (await session.execute(select(User).where(User.id == match.user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # 3. Auto-determine att_type: open check-in today → check_out; otherwise → check_in
    open_checkin = await _get_open_checkin(session, match.user_id, now)
    att_type = AttendanceType.check_out if open_checkin is not None else AttendanceType.check_in

    # 4. Schedule + geofence
    schedule = await schedule_service.get_default_schedule(session)
    location = {"lat": lat, "lng": lng} if lat is not None and lng is not None else None
    try:
        attendance_service.enforce_geofence(schedule, location)
    except attendance_service.GeofenceError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    # 5. Record + audit + webhook
    rec = await attendance_service.record(
        session,
        principal.tenant_id,
        match.user_id,
        att_type=att_type,
        occurred_at=now,
        schedule=schedule,
        location=location,
        liveness_score=liveness,
        device_id=principal.subject,
    )
    await audit_service.record(
        session,
        action=f"attendance.{att_type.value}",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": match.user_id, "status": rec.status.value, "auto": True},
    )
    await webhook_service.dispatch(
        session,
        principal.tenant_id,
        event=f"attendance.{att_type.value}",
        payload={
            "user_id": match.user_id,
            "full_name": user.full_name,
            "type": att_type.value,
            "status": rec.status.value,
            "occurred_at": rec.occurred_at.isoformat(),
            "liveness_score": liveness,
            "auto": True,
        },
    )

    return Envelope(
        data=AttendanceResult(
            user_id=match.user_id,
            full_name=user.full_name,
            similarity=round(match.similarity, 4),
            attendance=AttendanceOut.model_validate(rec),
        )
    )


@router.get("", response_model=Envelope[dict])
async def list_attendance(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    user_id: str | None = None,
    _: Principal = Depends(require_staff),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    base = select(AttendanceRecord)
    if user_id is not None:
        base = base.where(AttendanceRecord.user_id == user_id)

    count_stmt = select(func.count(AttendanceRecord.id))
    if user_id is not None:
        count_stmt = count_stmt.where(AttendanceRecord.user_id == user_id)
    total = (await session.execute(count_stmt)).scalar() or 0

    offset = (page - 1) * limit
    items_result = await session.execute(
        base.order_by(AttendanceRecord.occurred_at.desc()).offset(offset).limit(limit)
    )
    items = [AttendanceOut.model_validate(r) for r in items_result.scalars()]
    pages = (total + limit - 1) // limit if total > 0 else 0
    return Envelope(data={"items": items, "total": total, "page": page, "limit": limit, "pages": pages})
