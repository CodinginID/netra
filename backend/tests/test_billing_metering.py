"""Tests for usage-derived billing.

``billed_users`` used to be a number the caller typed into the invoice API,
which meant nothing verified what a tenant was charged. These cover the two
pieces that replace it: counting who actually used the system in a period, and
turning that count into money via the plan's tier bands.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest

from app.db.session import SessionFactory, _set_tenant
from app.models import (
    AttendanceRecord,
    AttendanceType,
    Plan,
    PlanTier,
    Role,
    SubscriptionStatus,
    Tenant,
    TenantStatus,
    TenantSubscription,
    User,
)
from app.services import billing_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


@asynccontextmanager
async def platform_session():
    """Platform-scoped session that hands its connection back clean.

    See test_billing_summary.py: skipping the rollback lets the next test's
    autouse TRUNCATE deadlock against a still-open transaction.
    """
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        try:
            yield session
        finally:
            await session.rollback()


async def _tenant(session, slug: str) -> str:
    tenant = Tenant(name=f"Tenant {slug}", slug=slug, status=TenantStatus.active)
    session.add(tenant)
    await session.flush()
    return tenant.id


async def _user(session, tenant_id: str, username: str) -> str:
    user = User(
        tenant_id=tenant_id,
        username=username,
        email=f"{username}@example.test",
        full_name=username,
        role=Role.end_user,
        password_hash="x",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user.id


async def _punch(
    session,
    tenant_id: str,
    user_id: str,
    *,
    when: datetime,
    deleted: bool = False,
) -> None:
    session.add(
        AttendanceRecord(
            tenant_id=tenant_id,
            user_id=user_id,
            type=AttendanceType.check_in,
            occurred_at=when,
            deleted_at=when if deleted else None,
        )
    )
    await session.flush()


async def _plan(
    session,
    code: str,
    bands: list[tuple[int, int | None, int, int]],
) -> Plan:
    """Create a plan whose tiers are (min_users, max_users, unit_price, min_charge)."""
    plan = Plan(
        code=code,
        name=f"Plan {code}",
        default_billing_cycle="annual",
        currency="IDR",
        features={},
        is_active=True,
    )
    session.add(plan)
    await session.flush()
    for i, (lo, hi, unit, floor) in enumerate(bands):
        session.add(
            PlanTier(
                plan_id=plan.id,
                min_users=lo,
                max_users=hi,
                unit_price=unit,
                min_charge=floor,
                sort_order=i,
            )
        )
    await session.flush()
    return plan


async def _subscribe(session, tenant_id: str, plan_id: str, **kwargs) -> TenantSubscription:
    sub = TenantSubscription(
        tenant_id=tenant_id,
        plan_id=plan_id,
        billing_cycle="annual",
        discount_pct=kwargs.get("discount_pct", 0),
        unit_price_override=kwargs.get("unit_price_override"),
        starts_at=_now(),
        ends_at=_now() + timedelta(days=365),
        status=SubscriptionStatus.active,
    )
    session.add(sub)
    await session.flush()
    return sub


# --------------------------------------------------------------------------- #
# count_billable_users
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_repeat_punches_bill_the_person_once():
    """Someone who clocks in every day is one billable user, not thirty."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "repeat")
        user_id = await _user(session, tenant_id, "daily")
        start = _now() - timedelta(days=30)
        for day in range(30):
            await _punch(session, tenant_id, user_id, when=start + timedelta(days=day))

        count = await billing_service.count_billable_users(
            session, tenant_id, start - timedelta(days=1), _now()
        )
        assert count == 1


@pytest.mark.asyncio
async def test_only_users_active_in_the_period_are_billed():
    """A user whose activity falls outside the window is not charged for."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "window")
        inside = await _user(session, tenant_id, "inside")
        outside = await _user(session, tenant_id, "outside")

        await _punch(session, tenant_id, inside, when=_now() - timedelta(days=5))
        await _punch(session, tenant_id, outside, when=_now() - timedelta(days=90))

        count = await billing_service.count_billable_users(
            session, tenant_id, _now() - timedelta(days=30), _now()
        )
        assert count == 1


@pytest.mark.asyncio
async def test_period_end_is_exclusive():
    """A punch exactly on period_end belongs to the next period, not this one."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "boundary")
        user_id = await _user(session, tenant_id, "edge")
        boundary = _now()
        await _punch(session, tenant_id, user_id, when=boundary)

        count = await billing_service.count_billable_users(
            session, tenant_id, boundary - timedelta(days=30), boundary
        )
        assert count == 0


@pytest.mark.asyncio
async def test_soft_deleted_records_are_not_billed():
    """Deleted attendance is retained data, not usage — it must not be charged."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "deleted")
        user_id = await _user(session, tenant_id, "removed")
        await _punch(
            session, tenant_id, user_id, when=_now() - timedelta(days=2), deleted=True
        )

        count = await billing_service.count_billable_users(
            session, tenant_id, _now() - timedelta(days=30), _now()
        )
        assert count == 0


@pytest.mark.asyncio
async def test_usage_is_counted_per_tenant():
    """One tenant's activity never lands on another tenant's invoice."""
    async with platform_session() as session:
        tenant_a = await _tenant(session, "meter-a")
        tenant_b = await _tenant(session, "meter-b")
        await _punch(
            session, tenant_a, await _user(session, tenant_a, "a1"),
            when=_now() - timedelta(days=1),
        )
        await _punch(
            session, tenant_b, await _user(session, tenant_b, "b1"),
            when=_now() - timedelta(days=1),
        )
        await _punch(
            session, tenant_b, await _user(session, tenant_b, "b2"),
            when=_now() - timedelta(days=1),
        )

        assert await billing_service.count_billable_users(
            session, tenant_a, _now() - timedelta(days=30), _now()
        ) == 1
        assert await billing_service.count_billable_users(
            session, tenant_b, _now() - timedelta(days=30), _now()
        ) == 2


# --------------------------------------------------------------------------- #
# get_plan_tier band selection
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_band_is_chosen_by_headcount_not_by_row_order():
    """Bands are selected on the numbers, regardless of how rows were ordered.

    The old query ordered by ``sort_order``, so tiers entered out of order
    billed at the wrong band. Here sort_order deliberately contradicts the
    bands: the correct 100-user rate is still the one that applies.
    """
    async with platform_session() as session:
        plan = Plan(
            code="scrambled", name="Scrambled", default_billing_cycle="annual",
            currency="IDR", features={}, is_active=True,
        )
        session.add(plan)
        await session.flush()
        # sort_order runs backwards relative to min_users.
        session.add(PlanTier(plan_id=plan.id, min_users=1, max_users=99,
                             unit_price=10_000, min_charge=0, sort_order=9))
        session.add(PlanTier(plan_id=plan.id, min_users=100, max_users=None,
                             unit_price=6_000, min_charge=0, sort_order=0))
        await session.flush()

        tier = await billing_service.get_plan_tier(session, plan.id, 100)
        assert tier.unit_price == 6_000

        tier = await billing_service.get_plan_tier(session, plan.id, 50)
        assert tier.unit_price == 10_000


# --------------------------------------------------------------------------- #
# generate_invoice
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_invoice_totals_are_derived_from_measured_usage():
    """The amount comes from who used the system, not from the caller."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "derived")
        plan = await _plan(session, "derived-plan", [(1, None, 8_000, 0)])
        await _subscribe(session, tenant_id, plan.id)

        for n in range(3):
            await _punch(
                session, tenant_id, await _user(session, tenant_id, f"u{n}"),
                when=_now() - timedelta(days=3),
            )

        invoice = await billing_service.generate_invoice(
            session, tenant_id, _now() - timedelta(days=30), _now()
        )
        assert invoice.billed_users == 3
        assert invoice.subtotal == 24_000
        assert invoice.total == 24_000


@pytest.mark.asyncio
async def test_min_charge_is_the_floor_for_a_quiet_period():
    """A near-idle tenant still owes the band's minimum."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "quiet")
        plan = await _plan(session, "quiet-plan", [(1, None, 8_000, 500_000)])
        await _subscribe(session, tenant_id, plan.id)

        await _punch(
            session, tenant_id, await _user(session, tenant_id, "lonely"),
            when=_now() - timedelta(days=1),
        )

        invoice = await billing_service.generate_invoice(
            session, tenant_id, _now() - timedelta(days=30), _now()
        )
        assert invoice.billed_users == 1
        assert invoice.subtotal == 500_000  # not 8_000


@pytest.mark.asyncio
async def test_growth_moves_the_tenant_into_a_cheaper_band():
    """Crossing a band boundary lowers the per-user price automatically."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "growing")
        plan = await _plan(
            session, "growth-plan", [(1, 99, 10_000, 0), (100, None, 6_000, 0)]
        )
        await _subscribe(session, tenant_id, plan.id)

        for n in range(100):
            await _punch(
                session, tenant_id, await _user(session, tenant_id, f"g{n}"),
                when=_now() - timedelta(days=2),
            )

        invoice = await billing_service.generate_invoice(
            session, tenant_id, _now() - timedelta(days=30), _now()
        )
        assert invoice.billed_users == 100
        assert invoice.subtotal == 600_000  # 100 x 6_000, not 100 x 10_000


@pytest.mark.asyncio
async def test_discount_and_tax_apply_in_that_order():
    """Tax is charged on the discounted amount, not the list price."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "discounted")
        plan = await _plan(session, "discount-plan", [(1, None, 10_000, 0)])
        await _subscribe(session, tenant_id, plan.id, discount_pct=10)

        for n in range(10):
            await _punch(
                session, tenant_id, await _user(session, tenant_id, f"d{n}"),
                when=_now() - timedelta(days=2),
            )

        invoice = await billing_service.generate_invoice(
            session, tenant_id, _now() - timedelta(days=30), _now(), tax_pct=11
        )
        assert invoice.subtotal == 100_000
        assert invoice.discount == 10_000
        assert invoice.tax_amount == 9_900   # 11% of 90_000, not of 100_000
        assert invoice.total == 99_900


@pytest.mark.asyncio
async def test_negotiated_unit_price_overrides_the_band():
    """A per-tenant price beats the tier's rate."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "negotiated")
        plan = await _plan(session, "negotiated-plan", [(1, None, 10_000, 0)])
        await _subscribe(session, tenant_id, plan.id, unit_price_override=4_000)

        for n in range(5):
            await _punch(
                session, tenant_id, await _user(session, tenant_id, f"n{n}"),
                when=_now() - timedelta(days=2),
            )

        invoice = await billing_service.generate_invoice(
            session, tenant_id, _now() - timedelta(days=30), _now()
        )
        assert invoice.subtotal == 20_000


@pytest.mark.asyncio
async def test_offset_aware_period_is_metered_as_the_same_instant():
    """A period sent with a +07:00 offset bills the same users as its UTC form.

    ``create_invoice`` re-parses dates and stamps UTC on them, which shifts the
    instant unless the boundary is converted first — so the window billed could
    drift seven hours from the window measured.
    """
    jakarta = timezone(timedelta(hours=7))
    async with platform_session() as session:
        tenant_id = await _tenant(session, "offset")
        plan = await _plan(session, "offset-plan", [(1, None, 1_000, 0)])
        await _subscribe(session, tenant_id, plan.id)

        await _punch(
            session, tenant_id, await _user(session, tenant_id, "o1"),
            when=_now() - timedelta(days=2),
        )

        start = (_now() - timedelta(days=30)).astimezone(jakarta)
        end = _now().astimezone(jakarta)
        invoice = await billing_service.generate_invoice(session, tenant_id, start, end)

        assert invoice.billed_users == 1
        assert invoice.period_start == start.astimezone(timezone.utc)
        assert invoice.period_end == end.astimezone(timezone.utc)


@pytest.mark.asyncio
async def test_backwards_period_is_refused():
    """A period that ends before it starts cannot produce a bill."""
    async with platform_session() as session:
        tenant_id = await _tenant(session, "backwards")
        plan = await _plan(session, "backwards-plan", [(1, None, 8_000, 0)])
        await _subscribe(session, tenant_id, plan.id)

        with pytest.raises(billing_service.BillingError):
            await billing_service.generate_invoice(
                session, tenant_id, _now(), _now() - timedelta(days=30)
            )
