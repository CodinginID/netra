"""Tenant management & onboarding service (Super Admin operations)."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Role, Tenant, TenantStatus, User
from app.schemas import TenantCreate


class TenantError(Exception):
    pass


async def create_tenant(session: AsyncSession, payload: TenantCreate) -> Tenant:
    """Create a tenant + its first Tenant Admin (onboarding)."""
    config = payload.config.model_dump() if payload.config is not None else {}
    tenant = Tenant(name=payload.name, slug=payload.slug, status=TenantStatus.active, config=config)
    session.add(tenant)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise TenantError(f"Tenant slug '{payload.slug}' already exists") from exc

    admin = User(
        tenant_id=tenant.id,
        email=payload.admin_email,
        username=payload.admin_username,
        full_name=payload.admin_full_name,
        role=Role.tenant_admin,
        password_hash=hash_password(payload.admin_password),
        is_active=True,
    )
    session.add(admin)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise TenantError(f"Email '{payload.admin_email}' is already registered") from exc
    return tenant


async def list_tenants(
    session: AsyncSession,
    *,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
) -> dict:
    """List tenants with pagination and optional search.

    Returns a dict with keys: items, total, page, limit, pages.
    """
    base = select(Tenant).where(Tenant.deleted_at.is_(None))
    if search:
        search_pattern = f"%{search}%"
        base = base.where(
            or_(Tenant.name.ilike(search_pattern), Tenant.slug.ilike(search_pattern))
        )

    count_stmt = select(func.count(Tenant.id)).select_from(Tenant).where(Tenant.deleted_at.is_(None))
    if search:
        search_pattern = f"%{search}%"
        count_stmt = count_stmt.where(
            or_(Tenant.name.ilike(search_pattern), Tenant.slug.ilike(search_pattern))
        )
    total = (await session.execute(count_stmt)).scalar() or 0

    offset = (page - 1) * limit
    items_result = await session.execute(
        base.order_by(Tenant.created_at.desc()).offset(offset).limit(limit)
    )
    items = list(items_result.scalars())
    pages = (total + limit - 1) // limit if total > 0 else 0

    return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}


async def get_tenant(session: AsyncSession, tenant_id: str) -> Tenant | None:
    result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    return result.scalar_one_or_none()


async def set_status(session: AsyncSession, tenant_id: str, status: TenantStatus) -> Tenant:
    tenant = await get_tenant(session, tenant_id)
    if tenant is None:
        raise TenantError("Tenant not found")
    tenant.status = status
    await session.flush()
    return tenant


async def update_config(session: AsyncSession, tenant_id: str, config: dict) -> Tenant:
    """Replace a tenant's configuration space (branding / attendance / kiosk)."""
    tenant = await get_tenant(session, tenant_id)
    if tenant is None:
        raise TenantError("Tenant not found")
    tenant.config = config
    await session.flush()
    return tenant
