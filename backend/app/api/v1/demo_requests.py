"""Public demo-request capture from the landing page + super-admin review."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_unscoped, require_super_admin
from app.core.ratelimit import demo_request_rate_limit
from app.models import DemoRequest, DemoRequestStatus
from app.schemas import DemoRequestCreate, DemoRequestSchema, DemoRequestUpdate, Envelope, PageData
from app.services import audit_service

router = APIRouter(prefix="/demo-requests", tags=["demo-requests"])


@router.post(
    "",
    response_model=Envelope[DemoRequestSchema],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(demo_request_rate_limit)],
)
async def create_demo_request(
    payload: DemoRequestCreate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[DemoRequestSchema]:
    """Public endpoint — no auth. Called from the marketing landing page."""
    demo_request = DemoRequest(
        name=payload.name,
        organization=payload.organization,
        email=payload.email,
        phone=payload.phone,
        message=payload.message,
    )
    session.add(demo_request)
    await session.flush()
    await session.refresh(demo_request)
    return Envelope(data=DemoRequestSchema.model_validate(demo_request))


@router.get(
    "",
    response_model=Envelope[PageData[DemoRequestSchema]],
    dependencies=[Depends(require_super_admin)],
)
async def list_demo_requests(
    status_filter: DemoRequestStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PageData[DemoRequestSchema]]:
    stmt = select(DemoRequest)
    if status_filter:
        stmt = stmt.where(DemoRequest.status == status_filter)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(DemoRequest.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = list((await session.execute(stmt)).scalars().all())

    return Envelope(
        data=PageData(
            items=[DemoRequestSchema.model_validate(r) for r in rows],
            total=total,
            page=page,
            limit=limit,
            pages=max(1, (total + limit - 1) // limit),
        )
    )


@router.patch(
    "/{demo_request_id}",
    response_model=Envelope[DemoRequestSchema],
    dependencies=[Depends(require_super_admin)],
)
async def update_demo_request(
    demo_request_id: str,
    payload: DemoRequestUpdate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[DemoRequestSchema]:
    stmt = select(DemoRequest).where(DemoRequest.id == demo_request_id)
    demo_request = (await session.execute(stmt)).scalar_one_or_none()
    if not demo_request:
        raise HTTPException(status_code=404, detail="Demo request not found")

    demo_request.status = payload.status
    await session.flush()
    await session.refresh(demo_request)

    await audit_service.record(
        session,
        action="demo_request.status_updated",
        actor="",
        tenant_id=None,
        detail={"demo_request_id": demo_request.id, "status": demo_request.status.value},
    )
    return Envelope(data=DemoRequestSchema.model_validate(demo_request))
