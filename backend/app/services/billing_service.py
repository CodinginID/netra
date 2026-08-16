"""Billing & Subscription service."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Invoice,
    InvoiceCounter,
    InvoiceLine,
    InvoiceStatus,
    Plan,
    PlanTier,
    SubscriptionStatus,
    TenantSubscription,
    UsageSnapshot,
)


class BillingError(Exception):
    pass


async def next_invoice_number(session: AsyncSession, when: datetime | None = None) -> str:
    """Reserve and format the next invoice number, e.g. ``INV-202608-0001``.

    The counter resets each month. Reservation is a single atomic statement, so
    concurrent callers each get a distinct number instead of colliding on the
    ``invoice_number`` unique constraint.
    """
    moment = when or datetime.now(timezone.utc)
    period = moment.strftime("%Y%m")

    stmt = (
        pg_insert(InvoiceCounter)
        .values(period=period, next_value=1)
        .on_conflict_do_update(
            index_elements=[InvoiceCounter.period],
            set_={"next_value": InvoiceCounter.next_value + 1},
        )
        .returning(InvoiceCounter.next_value)
    )
    seq = (await session.execute(stmt)).scalar_one()
    return f"INV-{period}-{seq:04d}"


async def get_plan_by_code(session: AsyncSession, code: str) -> Plan:
    """Get an active plan by its code (slug)."""
    stmt = select(Plan).where(Plan.code == code, Plan.is_active.is_(True))
    result = await session.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise BillingError(f"Plan '{code}' not found or inactive")
    return plan


async def get_plan_tier(session: AsyncSession, plan_id: str, min_users: int) -> PlanTier:
    """Get the applicable tier for a plan given the number of users."""
    stmt = (
        select(PlanTier)
        .where(PlanTier.plan_id == plan_id, PlanTier.min_users <= min_users)
        .order_by(PlanTier.sort_order.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    tier = result.scalar_one_or_none()
    if not tier:
        raise BillingError(f"No tier found for plan {plan_id} with {min_users} users")
    return tier


async def get_subscription_by_tenant(session: AsyncSession, tenant_id: str) -> TenantSubscription:
    """Get the current subscription for a tenant."""
    stmt = select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id)
    result = await session.execute(stmt)
    sub = result.scalar_one_or_none()
    if not sub:
        raise BillingError(f"No subscription found for tenant {tenant_id}")
    return sub


async def create_subscription(
    session: AsyncSession,
    tenant_id: str,
    plan_id: str,
    billing_cycle: str,
    unit_price_override: int | None = None,
    discount_pct: float = 0.0,
    starts_at: str | None = None,
    ends_at: str | None = None,
    trial_ends_at: str | None = None,
) -> TenantSubscription:
    """Create a new subscription for a tenant."""
    sub = TenantSubscription(
        tenant_id=tenant_id,
        plan_id=plan_id,
        billing_cycle=billing_cycle,
        unit_price_override=unit_price_override,
        discount_pct=discount_pct,
        starts_at=datetime.fromisoformat(starts_at).replace(tzinfo=timezone.utc) if starts_at else datetime.now(timezone.utc),
        ends_at=datetime.fromisoformat(ends_at).replace(tzinfo=timezone.utc) if ends_at else datetime.now(timezone.utc),
        trial_ends_at=datetime.fromisoformat(trial_ends_at).replace(tzinfo=timezone.utc) if trial_ends_at else None,
        status=SubscriptionStatus.trial,
    )
    session.add(sub)
    await session.flush()
    await session.refresh(sub)
    return sub


async def update_subscription_status(
    session: AsyncSession, subscription_id: str, status: SubscriptionStatus
) -> TenantSubscription:
    """Update subscription status."""
    stmt = select(TenantSubscription).where(TenantSubscription.id == subscription_id)
    result = await session.execute(stmt)
    sub = result.scalar_one_or_none()
    if not sub:
        raise BillingError(f"Subscription {subscription_id} not found")

    sub.status = status
    await session.flush()
    await session.refresh(sub)
    return sub


async def record_usage_snapshot(
    session: AsyncSession,
    tenant_id: str,
    snapshot_date: str,
    active_users: int,
    devices: int,
    punches: int,
) -> UsageSnapshot:
    """Record or update a daily usage snapshot for a tenant."""
    snap_date = datetime.fromisoformat(snapshot_date).replace(tzinfo=timezone.utc)

    stmt = select(UsageSnapshot).where(
        UsageSnapshot.tenant_id == tenant_id,
        UsageSnapshot.snapshot_date == snap_date,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.active_users = max(existing.active_users, active_users)
        existing.devices = max(existing.devices, devices)
        existing.punches = max(existing.punches, punches)
        await session.flush()
        await session.refresh(existing)
        return existing

    snapshot = UsageSnapshot(
        tenant_id=tenant_id,
        snapshot_date=snap_date,
        active_users=active_users,
        devices=devices,
        punches=punches,
    )
    session.add(snapshot)
    await session.flush()
    await session.refresh(snapshot)
    return snapshot


async def create_invoice(
    session: AsyncSession,
    tenant_id: str,
    subscription_id: str,
    period_start: str,
    period_end: str,
    billed_users: int,
    tier_id: str,
    subtotal: int,
    discount: int,
    tax_pct: float,
    tax_amount: int,
    total: int,
    currency: str,
    notes: str | None = None,
) -> Invoice:
    """Create a new invoice for a tenant.

    ``invoice_number`` is reserved here rather than passed in: it is NOT NULL
    and unique, and leaving it unset made every call to this function fail on
    a NotNullViolationError.
    """
    invoice = Invoice(
        invoice_number=await next_invoice_number(session),
        tenant_id=tenant_id,
        subscription_id=subscription_id,
        period_start=datetime.fromisoformat(period_start).replace(tzinfo=timezone.utc),
        period_end=datetime.fromisoformat(period_end).replace(tzinfo=timezone.utc),
        billed_users=billed_users,
        tier_id=tier_id,
        subtotal=subtotal,
        discount=discount,
        tax_pct=tax_pct,
        tax_amount=tax_amount,
        total=total,
        currency=currency,
        notes=notes,
        status=InvoiceStatus.draft,
    )
    session.add(invoice)
    await session.flush()
    await session.refresh(invoice)
    return invoice


async def add_invoice_line(
    session: AsyncSession,
    invoice_id: str,
    description: str,
    qty: int,
    unit_price: int,
    amount: int,
    sort_order: int = 0,
) -> InvoiceLine:
    """Add a line item to an invoice."""
    line = InvoiceLine(
        invoice_id=invoice_id,
        description=description,
        qty=qty,
        unit_price=unit_price,
        amount=amount,
        sort_order=sort_order,
    )
    session.add(line)
    await session.flush()
    await session.refresh(line)
    return line


async def get_invoice_by_number(session: AsyncSession, invoice_number: str) -> Invoice:
    """Get an invoice by its invoice number."""
    stmt = select(Invoice).where(Invoice.invoice_number == invoice_number)
    result = await session.execute(stmt)
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise BillingError(f"Invoice {invoice_number} not found")
    return invoice


async def get_invoices_by_tenant(
    session: AsyncSession,
    tenant_id: str,
    page: int = 1,
    limit: int = 20,
    status: InvoiceStatus | None = None,
) -> tuple[list[Invoice], int]:
    """Get paginated invoices for a tenant."""
    stmt = select(Invoice).where(Invoice.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Invoice.status == status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = stmt.order_by(Invoice.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await session.execute(stmt)
    invoices = list(result.scalars().all())
    return invoices, total


async def get_invoices_by_platform(
    session: AsyncSession,
    page: int = 1,
    limit: int = 20,
    status: InvoiceStatus | None = None,
) -> tuple[list[Invoice], int]:
    """Get paginated invoices across all tenants (platform view)."""
    stmt = select(Invoice)
    if status:
        stmt = stmt.where(Invoice.status == status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = stmt.order_by(Invoice.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await session.execute(stmt)
    invoices = list(result.scalars().all())
    return invoices, total
