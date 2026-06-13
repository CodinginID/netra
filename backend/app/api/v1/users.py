"""User management router (Tenant Admin, tenant-scoped via RLS)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.core.security import hash_password
from app.models import User
from app.schemas import Envelope, UserCreate, UserOut
from app.services import audit_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=Envelope[UserOut], status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[UserOut]:
    if principal.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant context required"
        )
    user = User(
        tenant_id=principal.tenant_id,
        full_name=payload.full_name,
        role=payload.role,
        username=payload.username,
        email=payload.email,
        external_id=payload.external_id,
        password_hash=hash_password(payload.password) if payload.password else None,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="username or external_id already exists in this tenant",
        ) from exc
    await audit_service.record(
        session,
        action="user.created",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user.id, "role": user.role.value},
    )
    return Envelope(data=UserOut.model_validate(user))


@router.get("", response_model=Envelope[list[UserOut]])
async def list_users(
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[UserOut]]:
    # RLS automatically restricts rows to the caller's tenant.
    users = list((await session.execute(select(User).order_by(User.created_at.desc()))).scalars())
    return Envelope(data=[UserOut.model_validate(u) for u in users])
