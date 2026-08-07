"""Public integration API (server-to-server, API-key authenticated).

This is the surface a tenant's OWN application calls to pull attendance data
into their dashboard. Authentication is by tenant API key (scope-checked), and
every query is automatically tenant-isolated by RLS via get_api_db.

Mostly read (pull) endpoints, plus an inbound roster upsert (POST /users,
scope users:write). Auth: send the key as ``X-API-Key: ntr_live_…`` or
``Authorization: Bearer ntr_live_…``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ApiPrincipal, get_api_db, require_scope
from app.api.v1.reports import DailyStatusOut
from app.core.config import settings
from app.models import AttendanceRecord, Role, User
from app.schemas import (
    AttendanceOut,
    EmbedSessionCreate,
    EmbedSessionMinted,
    Envelope,
    IntegrationUserOut,
    IntegrationUserUpsert,
    IntegrationUserUpsertOut,
    TenantConfig,
)
from app.services import (
    audit_service,
    embed_session_service,
    report_service,
    tenant_service,
    user_service,
)

router = APIRouter(prefix="/integration", tags=["integration"])

ATTENDANCE_READ = require_scope("attendance:read")
USERS_READ = require_scope("users:read")
USERS_WRITE = require_scope("users:write")
EMBED_ENROLL = require_scope("embed:enroll")

UPSERT_BATCH_LIMIT = 500


def _parse_day(value: str, field: str) -> datetime:
    try:
        d = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid '{field}' date, expected YYYY-MM-DD",
        ) from exc
    return d


@router.get("/attendance", response_model=Envelope[dict])
async def list_attendance(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=1000),
    user_id: str | None = Query(None, description="Filter to a single user"),
    date_from: str | None = Query(None, alias="from", description="YYYY-MM-DD (inclusive)"),
    date_to: str | None = Query(None, alias="to", description="YYYY-MM-DD (inclusive)"),
    _: ApiPrincipal = Depends(ATTENDANCE_READ),
    session: AsyncSession = Depends(get_api_db),
) -> Envelope[dict]:
    """Paginated attendance records for the calling tenant."""
    filters = [AttendanceRecord.deleted_at.is_(None), AttendanceRecord.tenant_id == principal.tenant_id]
    if user_id is not None:
        filters.append(AttendanceRecord.user_id == user_id)
    if date_from is not None:
        filters.append(AttendanceRecord.occurred_at >= _parse_day(date_from, "from"))
    if date_to is not None:
        # inclusive end → strictly before the next day
        filters.append(AttendanceRecord.occurred_at < _parse_day(date_to, "to") + timedelta(days=1))

    total = (
        await session.execute(select(func.count(AttendanceRecord.id)).where(*filters))
    ).scalar() or 0
    offset = (page - 1) * limit
    rows = (
        await session.execute(
            select(AttendanceRecord)
            .where(*filters)
            .order_by(AttendanceRecord.occurred_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars()
    items = [AttendanceOut.model_validate(r) for r in rows]
    pages = (total + limit - 1) // limit if total > 0 else 0
    return Envelope(
        data={"items": items, "total": total, "page": page, "limit": limit, "pages": pages}
    )


@router.get("/attendance/daily-status", response_model=Envelope[list[DailyStatusOut]])
async def daily_status(
    date_str: str = Query(..., alias="date", description="YYYY-MM-DD"),
    principal: ApiPrincipal = Depends(ATTENDANCE_READ),
    session: AsyncSession = Depends(get_api_db),
) -> Envelope[list[DailyStatusOut]]:
    """Daily roster: every active end-user with their status for the day."""
    day = _parse_day(date_str, "date").date()
    tenant = await tenant_service.get_tenant(session, principal.tenant_id)
    cfg = TenantConfig.model_validate((tenant.config if tenant else None) or {})
    rows = await report_service.daily_status(session, day, cfg.attendance.timezone, principal.tenant_id)
    return Envelope(
        data=[
            DailyStatusOut(
                user_id=r.user_id,
                full_name=r.full_name,
                external_id=r.external_id,
                status=r.status,  # type: ignore[arg-type]
                check_in_at=r.check_in_at,
                check_out_at=r.check_out_at,
            )
            for r in rows
        ]
    )


# --------------------------------------------------------------------------- #
# Users (pull) — for syncing roster + enrolled status to the client dashboard
# --------------------------------------------------------------------------- #
@router.get("/users", response_model=Envelope[dict])
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=1000),
    _: ApiPrincipal = Depends(USERS_READ),
    session: AsyncSession = Depends(get_api_db),
) -> Envelope[dict]:
    """Paginated end-users for the calling tenant, with their enrolled flag."""
    filters = [User.role == Role.end_user, User.deleted_at.is_(None), User.tenant_id == principal.tenant_id]
    total = (await session.execute(select(func.count(User.id)).where(*filters))).scalar() or 0
    offset = (page - 1) * limit
    rows = (
        await session.execute(
            select(User).where(*filters).order_by(User.full_name.asc()).offset(offset).limit(limit)
        )
    ).scalars()
    items = [IntegrationUserOut.model_validate(u) for u in rows]
    pages = (total + limit - 1) // limit if total > 0 else 0
    return Envelope(
        data={"items": items, "total": total, "page": page, "limit": limit, "pages": pages}
    )


# --------------------------------------------------------------------------- #
# Users (push) — inbound sync: the client app upserts its roster into netra
# --------------------------------------------------------------------------- #
@router.post("/users", response_model=Envelope[dict])
async def upsert_users(
    payload: IntegrationUserUpsert | list[IntegrationUserUpsert],
    principal: ApiPrincipal = Depends(USERS_WRITE),
    session: AsyncSession = Depends(get_api_db),
) -> Envelope[dict]:
    """Create-or-update end-users keyed by ``external_id`` (idempotent).

    Accepts one object or an array (bulk sync, max 500 per request). An
    existing ``external_id`` gets its ``full_name`` refreshed instead of a
    duplicate error, so the client can replay its full roster safely. Users
    created here merge with later embed enrollment on the same ``external_id``.
    """
    items = payload if isinstance(payload, list) else [payload]
    if not items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Payload must contain at least one user",
        )
    if len(items) > UPSERT_BATCH_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Too many users in one request (max {UPSERT_BATCH_LIMIT})",
        )

    # Dedupe within the batch (last occurrence wins) — two inserts with the
    # same external_id_hash in one transaction would violate the unique key.
    deduped = {item.external_id: item for item in items}

    results: list[IntegrationUserUpsertOut] = []
    created_count = 0
    for item in deduped.values():
        user, created = await user_service.upsert_end_user(
            session,
            principal.tenant_id,
            external_id=item.external_id,
            full_name=item.full_name,
        )
        created_count += created
        base = IntegrationUserOut.model_validate(user)
        results.append(IntegrationUserUpsertOut(**base.model_dump(), created=created))

    await audit_service.record(
        session,
        action="integration.users_upserted",
        actor=principal.key_id,
        tenant_id=principal.tenant_id,
        detail={
            "received": len(items),
            "created": created_count,
            "updated": len(deduped) - created_count,
        },
    )
    return Envelope(
        data={
            "items": results,
            "summary": {
                "received": len(items),
                "created": created_count,
                "updated": len(deduped) - created_count,
            },
        }
    )


# --------------------------------------------------------------------------- #
# Embed sessions (mint) — render netra enrollment inside the client app
# --------------------------------------------------------------------------- #
@router.post(
    "/embed-sessions",
    response_model=Envelope[EmbedSessionMinted],
    status_code=status.HTTP_201_CREATED,
)
async def mint_embed_session(
    payload: EmbedSessionCreate,
    request: Request,
    principal: ApiPrincipal = Depends(EMBED_ENROLL),
    session: AsyncSession = Depends(get_api_db),
) -> Envelope[EmbedSessionMinted]:
    """Mint a one-time embed session token + URL for the client to iframe."""
    if not embed_session_service.origin_allowed(principal.allowed_origins, payload.return_origin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="return_origin is not in this API key's embed allowlist",
        )

    embed, token = await embed_session_service.create(
        session,
        principal.tenant_id,
        external_id=payload.external_id,
        full_name=payload.full_name,
        return_origin=payload.return_origin,
        is_minor=payload.is_minor,
        ttl_minutes=settings.embed_ttl_minutes,
    )
    await audit_service.record(
        session,
        action="embed.session_minted",
        actor=principal.key_id,
        tenant_id=principal.tenant_id,
        detail={"embed_session_id": embed.id, "external_id": payload.external_id},
    )

    # Embed URL points at the frontend route /embed/enroll (the SPA serves the
    # chromeless page). Falls back to the request origin if EMBED_BASE_URL isn't
    # set — which is the API's own domain, not the SPA, so it's wrong for an
    # iframe src too; EMBED_BASE_URL must be configured in staging/production.
    base = (settings.embed_base_url or str(request.base_url)).rstrip("/")
    url = f"{base}/embed/enroll?token={token}"
    return Envelope(data=EmbedSessionMinted(token=token, url=url, expires_at=embed.expires_at))
