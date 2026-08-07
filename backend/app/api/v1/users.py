"""User management router (Tenant Admin, tenant-scoped via RLS)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, require_tenant_admin
from app.core.security import hash_password
from app.models import User
from app.schemas import Envelope, UserCreate, UserOut, UserUpdate
from app.services import audit_service
from app.services.soft_delete import restore as soft_restore, soft_delete

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


@router.get("", response_model=Envelope[dict])
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    search: str | None = Query(None, description="Search by name or username"),
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    base = select(User).where(
        User.deleted_at.is_(None),
        User.tenant_id == principal.tenant_id,
    )
    if search:
        search_pattern = f"%{search}%"
        base = base.where(
            or_(User.full_name.ilike(search_pattern), User.username.ilike(search_pattern))
        )

    # Count total
    count_stmt = select(func.count(User.id)).select_from(User).where(
        User.deleted_at.is_(None),
        User.tenant_id == principal.tenant_id,
    )
    if search:
        search_pattern = f"%{search}%"
        count_stmt = count_stmt.where(
            or_(User.full_name.ilike(search_pattern), User.username.ilike(search_pattern))
        )
    total = (await session.execute(count_stmt)).scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    items_stmt = base.order_by(User.created_at.desc()).offset(offset).limit(limit)
    items_result = await session.execute(items_stmt)
    items = [UserOut.model_validate(u) for u in items_result.scalars()]

    pages = (total + limit - 1) // limit if total > 0 else 0

    return Envelope(data={
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
    })


@router.patch("/{user_id}", response_model=Envelope[UserOut])
async def update_user(
    user_id: str,
    payload: UserUpdate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[UserOut]:
    user = await session.get(User, user_id)
    if user is None or user.tenant_id != principal.tenant_id:
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
    if user is None or user.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not await soft_delete(session, User, user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found or already deleted"
        )
    await audit_service.record(
        session,
        action="user.deleted",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id},
    )


@router.get("/trash", response_model=Envelope[list[UserOut]])
async def list_deleted_users(
    _: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[list[UserOut]]:
    """List soft-deleted users (recycle bin)."""
    result = await session.execute(
        select(User).where(
            User.deleted_at.isnot(None),
            User.tenant_id == principal.tenant_id,
        ).order_by(User.deleted_at.desc())
    )
    return Envelope(data=[UserOut.model_validate(u) for u in result.scalars()])


@router.post("/{user_id}/restore", response_model=Envelope[UserOut])
async def restore_user(
    user_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[UserOut]:
    """Restore a soft-deleted user."""
    restored = await soft_restore(session, User, user_id)
    if not restored:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found or not deleted"
        )
    user = (await session.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == principal.tenant_id,
        )
    )).scalar_one()
    await audit_service.record(
        session,
        action="user.restored",
        actor=principal.subject,
        tenant_id=principal.tenant_id,
        detail={"user_id": user_id},
    )
    return Envelope(data=UserOut.model_validate(user))
