"""User management router (Tenant Admin, tenant-scoped via RLS)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.core.security import hash_password
from app.models import User
from app.schemas import Envelope, UserCreate, UserOut, UserUpdate
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


@router.patch("/{user_id}", response_model=Envelope[UserOut])
async def update_user(
    user_id: str,
    payload: UserUpdate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[UserOut]:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.username is not None:
        user.username = payload.username or None
    if payload.is_active is not None:
        user.is_active = payload.is_active
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="username already exists in this tenant",
        ) from exc
    await audit_service.record(
        session,
        action="user.updated",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id},
    )
    return Envelope(data=UserOut.model_validate(user))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await session.delete(user)
    await audit_service.record(
        session,
        action="user.deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id},
    )
