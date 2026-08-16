"""Billing & Subscription service."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
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
    Tenant,
    TenantStatus,
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


# How far ahead the dashboard looks when flagging things about to lapse.
# Named here rather than inlined so the two windows are visible side by side
# and cannot drift apart between the query and the UI copy.
TRIAL_ENDING_WINDOW_DAYS = 7
SUBSCRIPTION_ENDING_WINDOW_DAYS = 30


async def operational_summary(session: AsyncSession, now: datetime | None = None) -> dict:
    """Aggregate the "who needs chasing" figures for the billing dashboard.

    Every number is computed by the database. Pulling invoices into Python to
    sum them would degrade as the invoice table grows, which is exactly the
    direction it only ever moves.

    Money is reported per currency: ``Invoice.currency`` is per row, so adding
    totals across currencies would produce a number that means nothing.
    """
    moment = now or datetime.now(timezone.utc)
    month_start = moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    unpaid = (Invoice.status == InvoiceStatus.issued) & (Invoice.paid_at.is_(None))
    overdue = unpaid & (Invoice.due_date.isnot(None)) & (Invoice.due_date < moment)
    draft = Invoice.status == InvoiceStatus.draft
    paid_this_month = (Invoice.status == InvoiceStatus.paid) & (Invoice.paid_at >= month_start)

    def _count(cond):
        return func.count().filter(cond)

    def _sum(cond):
        return func.coalesce(func.sum(Invoice.total).filter(cond), 0)

    stmt = select(
        Invoice.currency,
        _count(unpaid), _sum(unpaid),
        _count(overdue), _sum(overdue),
        _count(draft), _sum(draft),
        _count(paid_this_month), _sum(paid_this_month),
    ).group_by(Invoice.currency)

    buckets: dict[str, dict] = {
        name: {"count": 0, "by_currency": []}
        for name in ("unpaid", "overdue", "draft", "paid_this_month")
    }
    for row in (await session.execute(stmt)).all():
        currency = row[0]
        for offset, name in enumerate(("unpaid", "overdue", "draft", "paid_this_month")):
            count, total = row[1 + offset * 2], row[2 + offset * 2]
            if count:
                buckets[name]["count"] += count
                buckets[name]["by_currency"].append(
                    {"currency": currency, "total": int(total)}
                )

    async def _scalar(stmt_) -> int:
        return (await session.execute(stmt_)).scalar() or 0

    trials_ending = await _scalar(
        select(func.count()).select_from(TenantSubscription).where(
            TenantSubscription.status == SubscriptionStatus.trial,
            TenantSubscription.trial_ends_at.isnot(None),
            TenantSubscription.trial_ends_at >= moment,
            TenantSubscription.trial_ends_at
            <= moment + timedelta(days=TRIAL_ENDING_WINDOW_DAYS),
        )
    )
    past_due_count = await _scalar(
        select(func.count()).select_from(TenantSubscription).where(
            TenantSubscription.status == SubscriptionStatus.past_due
        )
    )
    subscriptions_ending = await _scalar(
        select(func.count()).select_from(TenantSubscription).where(
            TenantSubscription.status == SubscriptionStatus.active,
            TenantSubscription.ends_at >= moment,
            TenantSubscription.ends_at
            <= moment + timedelta(days=SUBSCRIPTION_ENDING_WINDOW_DAYS),
        )
    )
    # Soft-deleted tenants are excluded: they are on their way out, so listing
    # them as "missing a subscription" would be permanent noise.
    tenants_without_subscription = await _scalar(
        select(func.count()).select_from(Tenant).where(
            Tenant.status == TenantStatus.active,
            Tenant.deleted_at.is_(None),
            ~select(TenantSubscription.id)
            .where(TenantSubscription.tenant_id == Tenant.id)
            .exists(),
        )
    )

    return {
        **buckets,
        "trials_ending": trials_ending,
        "past_due_count": past_due_count,
        "subscriptions_ending": subscriptions_ending,
        "tenants_without_subscription": tenants_without_subscription,
    }


#: How far back the usage view looks when computing a trend.
USAGE_TREND_WINDOW_DAYS = 7


async def usage_by_tenant(session: AsyncSession, now: datetime | None = None) -> list[dict]:
    """Latest usage snapshot per tenant, with a 7-day trend and tier headroom.

    "Latest per tenant" is resolved with a window function in one query. Asking
    per tenant in a loop would issue a query per tenant on a page that exists
    precisely to compare tenants against each other.
    """
    moment = now or datetime.now(timezone.utc)
    cutoff = moment - timedelta(days=USAGE_TREND_WINDOW_DAYS)

    ranked = select(
        UsageSnapshot.tenant_id,
        UsageSnapshot.snapshot_date,
        UsageSnapshot.active_users,
        UsageSnapshot.devices,
        UsageSnapshot.punches,
        func.row_number()
        .over(
            partition_by=UsageSnapshot.tenant_id,
            order_by=UsageSnapshot.snapshot_date.desc(),
        )
        .label("rn"),
    ).subquery()

    latest = select(ranked).where(ranked.c.rn == 1).subquery()

    # Baseline for the trend: the newest snapshot at or before the cutoff.
    baseline = select(
        UsageSnapshot.tenant_id,
        UsageSnapshot.active_users.label("baseline_users"),
        func.row_number()
        .over(
            partition_by=UsageSnapshot.tenant_id,
            order_by=UsageSnapshot.snapshot_date.desc(),
        )
        .label("rn"),
    ).where(UsageSnapshot.snapshot_date <= cutoff).subquery()
    baseline_latest = select(baseline).where(baseline.c.rn == 1).subquery()

    # The plan's ceiling is the top band's max_users — NULL (unlimited) if any
    # band is open-ended. Joining the band that *contains* current usage would
    # be wrong here: a tenant that has outgrown its plan matches no band at all,
    # so it would silently read as within limits, the exact opposite of the
    # signal this column exists to give.
    ceiling = (
        select(
            PlanTier.plan_id.label("plan_id"),
            case(
                (func.bool_or(PlanTier.max_users.is_(None)), None),
                else_=func.max(PlanTier.max_users),
            ).label("max_users"),
        )
        .group_by(PlanTier.plan_id)
        .subquery()
    )

    stmt = (
        select(
            latest.c.tenant_id,
            Tenant.name,
            latest.c.snapshot_date,
            latest.c.active_users,
            latest.c.devices,
            latest.c.punches,
            baseline_latest.c.baseline_users,
            Plan.name.label("plan_name"),
            ceiling.c.max_users,
        )
        .join(Tenant, Tenant.id == latest.c.tenant_id)
        .outerjoin(baseline_latest, baseline_latest.c.tenant_id == latest.c.tenant_id)
        .outerjoin(TenantSubscription, TenantSubscription.tenant_id == latest.c.tenant_id)
        .outerjoin(Plan, Plan.id == TenantSubscription.plan_id)
        .outerjoin(ceiling, ceiling.c.plan_id == Plan.id)
        .order_by(latest.c.active_users.desc())
    )

    rows = []
    for r in (await session.execute(stmt)).all():
        active_users = r.active_users or 0
        rows.append(
            {
                "tenant_id": r.tenant_id,
                "tenant_name": r.name,
                "snapshot_date": r.snapshot_date.isoformat(),
                "active_users": active_users,
                "devices": r.devices or 0,
                "punches": r.punches or 0,
                # None (not 0) when there is no baseline yet: "no comparison
                # available" and "flat" are different facts, and showing a flat
                # arrow for a brand-new tenant would be a lie.
                "active_users_delta_7d": (
                    None if r.baseline_users is None else active_users - r.baseline_users
                ),
                "plan_name": r.plan_name,
                "tier_max_users": r.max_users,
                # Exactly at max_users is within the tier; one above is over.
                "over_tier": r.max_users is not None and active_users > r.max_users,
            }
        )
    return rows


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
