"""Billing & Subscription API router (Super Admin + Tenant Admin)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    PLATFORM_TENANT_SCOPE,
    Principal,
    get_db,
    get_db_unscoped,
    require_super_admin,
    require_tenant_admin,
)
from app.models import Invoice, InvoiceLine, InvoiceStatus, Plan, PlanTier, SubscriptionStatus, TenantSubscription, UsageSnapshot
from app.core.config import settings
from app.schemas import (
    Envelope,
    InvoiceCreate,
    InvoiceLineSchema,
    InvoiceSchema,
    InvoiceUpdate,
    PageData,
    PlanCreate,
    PlanSchema,
    PlanTierCreate,
    PlanTierSchema,
    PlanTierUpdate,
    PlanUpdate,
    SubscriptionCreate,
    SubscriptionSchema,
    SubscriptionUpdate,
)
from app.services import audit_service, billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


async def _get_plan(session: AsyncSession, plan_id: str) -> Plan:
    stmt = select(Plan).where(Plan.id == plan_id)
    plan = (await session.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


# --------------------------------------------------------------------------- #
# Plans (platform-level, super admin only)
# --------------------------------------------------------------------------- #
@router.post(
    "/plans",
    response_model=Envelope[PlanSchema],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_plan(
    payload: PlanCreate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PlanSchema]:
    plan = Plan(
        code=payload.code,
        name=payload.name,
        edition=payload.edition,
        default_billing_cycle=payload.default_billing_cycle,
        currency=payload.currency,
        features=payload.features or {},
    )
    session.add(plan)
    await session.flush()
    await session.refresh(plan)

    await audit_service.record(
        session,
        action="billing.plan.created",
        actor="",  # platform-level
        tenant_id=None,
        detail={"plan_code": plan.code},
    )
    return Envelope(data=PlanSchema.model_validate(plan))


@router.get(
    "/plans",
    response_model=Envelope[PageData[PlanSchema]],
    dependencies=[Depends(require_super_admin)],
)
async def list_plans(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    active_only: bool = Query(False),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PageData[PlanSchema]]:
    stmt = select(Plan)
    if active_only:
        stmt = stmt.where(Plan.is_active.is_(True))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(Plan.created_at.desc()).offset((page - 1) * limit).limit(limit)
    plans = list((await session.execute(stmt)).scalars().all())

    return Envelope(
        data=PageData(
            items=[PlanSchema.model_validate(p) for p in plans],
            total=total,
            page=page,
            limit=limit,
            pages=max(1, (total + limit - 1) // limit),
        )
    )


@router.get(
    "/plans/{plan_id}",
    response_model=Envelope[PlanSchema],
    dependencies=[Depends(require_super_admin)],
)
async def get_plan(
    plan_id: str,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PlanSchema]:
    plan = await _get_plan(session, plan_id)
    return Envelope(data=PlanSchema.model_validate(plan))


@router.patch(
    "/plans/{plan_id}",
    response_model=Envelope[PlanSchema],
    dependencies=[Depends(require_super_admin)],
)
async def update_plan(
    plan_id: str,
    payload: PlanUpdate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PlanSchema]:
    plan = await _get_plan(session, plan_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)

    await session.flush()
    await session.refresh(plan)
    await audit_service.record(
        session,
        action="billing.plan.updated",
        actor="",
        tenant_id=None,
        detail={"plan_code": plan.code},
    )
    return Envelope(data=PlanSchema.model_validate(plan))


@router.delete(
    "/plans/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_plan(
    plan_id: str,
    session: AsyncSession = Depends(get_db_unscoped),
) -> None:
    plan = await _get_plan(session, plan_id)
    await session.delete(plan)
    await session.flush()
    await audit_service.record(
        session,
        action="billing.plan.deleted",
        actor="",
        tenant_id=None,
        detail={"plan_code": plan.code},
    )


# --------------------------------------------------------------------------- #
# Plan Tiers (platform-level, super admin only)
# --------------------------------------------------------------------------- #
@router.post(
    "/plans/{plan_id}/tiers",
    response_model=Envelope[PlanTierSchema],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_plan_tier(
    plan_id: str,
    payload: PlanTierCreate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PlanTierSchema]:
    await _get_plan(session, plan_id)
    tier = PlanTier(
        plan_id=plan_id,
        min_users=payload.min_users,
        max_users=payload.max_users,
        unit_price=payload.unit_price,
        min_charge=payload.min_charge,
        sort_order=payload.sort_order,
    )
    session.add(tier)
    await session.flush()
    await session.refresh(tier)

    await audit_service.record(
        session,
        action="billing.plan_tier.created",
        actor="",
        tenant_id=None,
        detail={"plan_id": plan_id, "min_users": tier.min_users},
    )
    return Envelope(data=PlanTierSchema.model_validate(tier))


@router.get(
    "/plans/{plan_id}/tiers",
    response_model=Envelope[list[PlanTierSchema]],
    dependencies=[Depends(require_super_admin)],
)
async def list_plan_tiers(
    plan_id: str,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[list[PlanTierSchema]]:
    await _get_plan(session, plan_id)
    stmt = select(PlanTier).where(PlanTier.plan_id == plan_id).order_by(PlanTier.sort_order)
    tiers = list((await session.execute(stmt)).scalars().all())
    return Envelope(data=[PlanTierSchema.model_validate(t) for t in tiers])


@router.patch(
    "/plans/{plan_id}/tiers/{tier_id}",
    response_model=Envelope[PlanTierSchema],
    dependencies=[Depends(require_super_admin)],
)
async def update_plan_tier(
    plan_id: str,
    tier_id: str,
    payload: PlanTierUpdate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PlanTierSchema]:
    await _get_plan(session, plan_id)
    stmt = select(PlanTier).where(PlanTier.id == tier_id, PlanTier.plan_id == plan_id)
    tier = (await session.execute(stmt)).scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tier, field, value)

    await session.flush()
    await session.refresh(tier)
    return Envelope(data=PlanTierSchema.model_validate(tier))


@router.delete(
    "/plans/{plan_id}/tiers/{tier_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_plan_tier(
    plan_id: str,
    tier_id: str,
    session: AsyncSession = Depends(get_db_unscoped),
) -> None:
    await _get_plan(session, plan_id)
    stmt = select(PlanTier).where(PlanTier.id == tier_id, PlanTier.plan_id == plan_id)
    tier = (await session.execute(stmt)).scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")

    await session.delete(tier)
    await session.flush()


# --------------------------------------------------------------------------- #
# Subscriptions (tenant-scoped, super admin + tenant admin)
# --------------------------------------------------------------------------- #
@router.post(
    "/subscriptions",
    response_model=Envelope[SubscriptionSchema],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_subscription(
    payload: SubscriptionCreate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[SubscriptionSchema]:
    await _get_plan(session, payload.plan_id)
    sub = TenantSubscription(
        tenant_id=payload.tenant_id,
        plan_id=payload.plan_id,
        billing_cycle=payload.billing_cycle,
        unit_price_override=payload.unit_price_override,
        discount_pct=payload.discount_pct,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        trial_ends_at=payload.trial_ends_at,
        status=payload.status,
    )
    session.add(sub)
    await session.flush()
    await session.refresh(sub)

    await audit_service.record(
        session,
        action="billing.subscription.created",
        actor="",
        tenant_id=sub.tenant_id,
        detail={"subscription_id": sub.id, "plan_id": sub.plan_id},
    )
    return Envelope(data=SubscriptionSchema.model_validate(sub))


@router.get(
    "/subscriptions",
    response_model=Envelope[PageData[SubscriptionSchema]],
    dependencies=[Depends(require_super_admin)],
)
async def list_subscriptions(
    tenant_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PageData[SubscriptionSchema]]:
    stmt = select(TenantSubscription)
    if tenant_id:
        stmt = stmt.where(TenantSubscription.tenant_id == tenant_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(TenantSubscription.created_at.desc()).offset((page - 1) * limit).limit(limit)
    subs = list((await session.execute(stmt)).scalars().all())

    return Envelope(
        data=PageData(
            items=[SubscriptionSchema.model_validate(s) for s in subs],
            total=total,
            page=page,
            limit=limit,
            pages=max(1, (total + limit - 1) // limit),
        )
    )


@router.get(
    "/subscriptions/{sub_id}",
    response_model=Envelope[SubscriptionSchema],
)
async def get_subscription(
    sub_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[SubscriptionSchema]:
    if principal.platform_scope:
        stmt = select(TenantSubscription).where(TenantSubscription.id == sub_id)
    else:
        stmt = select(TenantSubscription).where(
            TenantSubscription.id == sub_id,
            TenantSubscription.tenant_id == principal.tenant_id,
        )
    sub = (await session.execute(stmt)).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return Envelope(data=SubscriptionSchema.model_validate(sub))


@router.patch(
    "/subscriptions/{sub_id}",
    response_model=Envelope[SubscriptionSchema],
)
async def update_subscription(
    sub_id: str,
    payload: SubscriptionUpdate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[SubscriptionSchema]:
    if principal.platform_scope:
        stmt = select(TenantSubscription).where(TenantSubscription.id == sub_id)
    else:
        stmt = select(TenantSubscription).where(
            TenantSubscription.id == sub_id,
            TenantSubscription.tenant_id == principal.tenant_id,
        )
    sub = (await session.execute(stmt)).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(sub, field, value)

    await session.flush()
    await session.refresh(sub)

    await audit_service.record(
        session,
        action="billing.subscription.updated",
        actor=principal.subject,
        tenant_id=sub.tenant_id,
        detail={"subscription_id": sub.id},
    )
    return Envelope(data=SubscriptionSchema.model_validate(sub))


@router.delete(
    "/subscriptions/{sub_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def cancel_subscription(
    sub_id: str,
    session: AsyncSession = Depends(get_db_unscoped),
) -> None:
    stmt = select(TenantSubscription).where(TenantSubscription.id == sub_id)
    sub = (await session.execute(stmt)).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    sub.status = SubscriptionStatus.canceled
    await session.flush()

    await audit_service.record(
        session,
        action="billing.subscription.cancelled",
        actor="",
        tenant_id=sub.tenant_id,
        detail={"subscription_id": sub.id},
    )


# --------------------------------------------------------------------------- #
# Usage Snapshots (platform + tenant-scoped)
# --------------------------------------------------------------------------- #
@router.get(
    "/usage",
    response_model=Envelope[PageData[dict]],
    dependencies=[Depends(require_super_admin)],
)
async def list_usage_snapshots(
    tenant_id: str | None = Query(None, description="Filter by tenant"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[PageData[dict]]:
    stmt = select(UsageSnapshot)
    if tenant_id:
        stmt = stmt.where(UsageSnapshot.tenant_id == tenant_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(UsageSnapshot.snapshot_date.desc()).offset((page - 1) * limit).limit(limit)
    rows = list((await session.execute(stmt)).scalars().all())

    items = [
        {
            "id": r.id,
            "tenant_id": r.tenant_id,
            "snapshot_date": r.snapshot_date.isoformat(),
            "active_users": r.active_users,
            "devices": r.devices,
            "punches": r.punches,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]

    return Envelope(
        data=PageData(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=max(1, (total + limit - 1) // limit),
        )
    )


# --------------------------------------------------------------------------- #
# Invoices (tenant-scoped, tenant admin can see own; super admin can see all)
# --------------------------------------------------------------------------- #
@router.post(
    "/invoices",
    response_model=Envelope[InvoiceSchema],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_invoice(
    payload: InvoiceCreate,
    session: AsyncSession = Depends(get_db_unscoped),
) -> Envelope[InvoiceSchema]:
    """Issue an invoice for a tenant.

    Super-admin only: invoices are raised by the platform, not by the tenant
    being billed. The invoice number comes from the monthly counter, never from
    the client.
    """
    invoice = Invoice(
        invoice_number=await billing_service.next_invoice_number(session),
        tenant_id=payload.tenant_id,
        subscription_id=payload.subscription_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        billed_users=payload.billed_users,
        tier_id=payload.tier_id,
        subtotal=payload.subtotal,
        discount=payload.discount,
        tax_pct=payload.tax_pct,
        tax_amount=payload.tax_amount,
        total=payload.total,
        currency=payload.currency,
        status=payload.status,
        notes=payload.notes,
    )
    # Created straight into 'issued' — stamp the same dates the draft→issued
    # transition in update_invoice would have stamped.
    if invoice.status == InvoiceStatus.issued:
        invoice.issued_at = datetime.now(timezone.utc)
        invoice.due_date = invoice.issued_at + timedelta(days=settings.invoice_net_days)

    session.add(invoice)
    await session.flush()
    # Load `lines` explicitly: InvoiceSchema reads it, and letting Pydantic
    # touch the unloaded relationship triggers a lazy load outside the async
    # context, which fails with MissingGreenlet rather than returning [].
    await session.refresh(invoice, attribute_names=["lines"])

    await audit_service.record(
        session,
        action="billing.invoice.created",
        actor="",
        tenant_id=invoice.tenant_id,
        detail={"invoice_number": invoice.invoice_number, "total": invoice.total},
    )
    return Envelope(data=InvoiceSchema.model_validate(invoice))


@router.get(
    "/invoices",
    response_model=Envelope[PageData[dict]],
)
async def list_invoices(
    principal: Principal = Depends(require_tenant_admin),
    tenant_id: str | None = Query(None),
    status_filter: InvoiceStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
) -> Envelope[PageData[dict]]:
    if principal.platform_scope:
        stmt = select(Invoice)
    else:
        stmt = select(Invoice).where(Invoice.tenant_id == principal.tenant_id)

    if status_filter:
        stmt = stmt.where(Invoice.status == status_filter)
    if tenant_id and principal.platform_scope:
        stmt = stmt.where(Invoice.tenant_id == tenant_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(Invoice.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = list((await session.execute(stmt)).scalars().all())

    items = [
        {
            "id": r.id,
            "invoice_number": r.invoice_number,
            "tenant_id": r.tenant_id,
            "subscription_id": r.subscription_id,
            "period_start": r.period_start.isoformat(),
            "period_end": r.period_end.isoformat(),
            "billed_users": r.billed_users,
            "tier_id": r.tier_id,
            "subtotal": r.subtotal,
            "discount": r.discount,
            "tax_pct": r.tax_pct,
            "tax_amount": r.tax_amount,
            "total": r.total,
            "currency": r.currency,
            "status": r.status.value,
            "issued_at": r.issued_at.isoformat() if r.issued_at else None,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "paid_at": r.paid_at.isoformat() if r.paid_at else None,
            "notes": r.notes,
            "lines": [],
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]

    return Envelope(
        data=PageData(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=max(1, (total + limit - 1) // limit),
        )
    )


@router.get(
    "/invoices/{invoice_id}",
    response_model=Envelope[dict],
)
async def get_invoice(
    invoice_id: str,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    if principal.platform_scope:
        stmt = select(Invoice).where(Invoice.id == invoice_id)
    else:
        stmt = select(Invoice).where(
            Invoice.id == invoice_id, Invoice.tenant_id == principal.tenant_id
        )
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Load lines
    lines_stmt = select(InvoiceLine).where(InvoiceLine.invoice_id == inv.id).order_by(InvoiceLine.sort_order)
    lines = list((await session.execute(lines_stmt)).scalars().all())

    return Envelope(
        data={
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "tenant_id": inv.tenant_id,
            "subscription_id": inv.subscription_id,
            "period_start": inv.period_start.isoformat(),
            "period_end": inv.period_end.isoformat(),
            "billed_users": inv.billed_users,
            "tier_id": inv.tier_id,
            "subtotal": inv.subtotal,
            "discount": inv.discount,
            "tax_pct": inv.tax_pct,
            "tax_amount": inv.tax_amount,
            "total": inv.total,
            "currency": inv.currency,
            "status": inv.status.value,
            "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "notes": inv.notes,
            "lines": [
                {
                    "id": l.id,
                    "description": l.description,
                    "qty": l.qty,
                    "unit_price": l.unit_price,
                    "amount": l.amount,
                    "sort_order": l.sort_order,
                    "created_at": l.created_at.isoformat(),
                    "updated_at": l.updated_at.isoformat(),
                }
                for l in lines
            ],
            "created_at": inv.created_at.isoformat(),
            "updated_at": inv.updated_at.isoformat(),
        }
    )


@router.patch(
    "/invoices/{invoice_id}",
    response_model=Envelope[dict],
)
async def update_invoice(
    invoice_id: str,
    payload: InvoiceUpdate,
    principal: Principal = Depends(require_tenant_admin),
    session: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    if principal.platform_scope:
        stmt = select(Invoice).where(Invoice.id == invoice_id)
    else:
        stmt = select(Invoice).where(
            Invoice.id == invoice_id, Invoice.tenant_id == principal.tenant_id
        )
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    became_issued = (
        payload.status == InvoiceStatus.issued and inv.status != InvoiceStatus.issued
    )
    if payload.status is not None:
        inv.status = payload.status
    if payload.notes is not None:
        inv.notes = payload.notes
    if payload.due_date is not None:
        inv.due_date = payload.due_date

    if became_issued:
        if inv.issued_at is None:
            inv.issued_at = datetime.now(timezone.utc)
        # Fill the deadline only when nobody supplied one, so an explicit
        # due_date in this very request survives the default net terms.
        if inv.due_date is None:
            inv.due_date = inv.issued_at + timedelta(days=settings.invoice_net_days)
    if payload.status == InvoiceStatus.paid and inv.paid_at is None:
        inv.paid_at = datetime.now(timezone.utc)

    await session.flush()
    await session.refresh(inv)

    await audit_service.record(
        session,
        action="billing.invoice.updated",
        actor=principal.subject,
        tenant_id=inv.tenant_id,
        detail={"invoice_number": inv.invoice_number, "status": inv.status.value},
    )

    # Load lines for response
    lines_stmt = select(InvoiceLine).where(InvoiceLine.invoice_id == inv.id).order_by(InvoiceLine.sort_order)
    lines = list((await session.execute(lines_stmt)).scalars().all())

    return Envelope(
        data={
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "tenant_id": inv.tenant_id,
            "subscription_id": inv.subscription_id,
            "period_start": inv.period_start.isoformat(),
            "period_end": inv.period_end.isoformat(),
            "billed_users": inv.billed_users,
            "tier_id": inv.tier_id,
            "subtotal": inv.subtotal,
            "discount": inv.discount,
            "tax_pct": inv.tax_pct,
            "tax_amount": inv.tax_amount,
            "total": inv.total,
            "currency": inv.currency,
            "status": inv.status.value,
            "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "notes": inv.notes,
            "lines": [
                {
                    "id": l.id,
                    "description": l.description,
                    "qty": l.qty,
                    "unit_price": l.unit_price,
                    "amount": l.amount,
                    "sort_order": l.sort_order,
                    "created_at": l.created_at.isoformat(),
                    "updated_at": l.updated_at.isoformat(),
                }
                for l in lines
            ],
            "created_at": inv.created_at.isoformat(),
            "updated_at": inv.updated_at.isoformat(),
        }
    )
