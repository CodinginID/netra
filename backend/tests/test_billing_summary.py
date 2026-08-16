"""Tests for the operational billing summary (GET /billing/summary).

Covers the buckets the dashboard renders — unpaid, overdue, draft, paid this
month — plus the lapse signals, and the due_date rules that make "overdue"
meaningful in the first place.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.db.session import SessionFactory, _set_tenant
from app.models import (
    Invoice,
    InvoiceStatus,
    Plan,
    SubscriptionStatus,
    Tenant,
    TenantStatus,
    TenantSubscription,
)
from app.services import billing_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


@asynccontextmanager
async def platform_session():
    """Platform-scoped session that always hands its connection back clean.

    Without the explicit rollback the pooled connection can return to the pool
    with its transaction still open. The next test's autouse TRUNCATE then
    deadlocks against it, and the fallout looks nothing like the cause: the
    tables survive uncleaned, so the super_admin fixture hits a duplicate-key
    on owner@netra.app and later logins come back 401.
    """
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        try:
            yield session
        finally:
            await session.rollback()


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _create_tenant_via_api(client: AsyncClient, token: str, slug: str) -> str:
    """Create a tenant over HTTP and return its id.

    API-driven tests stay entirely on the client. Opening a SessionFactory and
    committing from inside a test that also issues HTTP calls leaves a second
    connection in play, which races the autouse TRUNCATE and makes the whole
    file flaky.
    """
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": f"Tenant {slug}",
            "slug": slug,
            "admin_email": f"admin@{slug}.app",
            "admin_password": "adminpass123",
            "admin_full_name": f"Admin {slug}",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _tenant(session, slug: str, *, deleted: bool = False) -> Tenant:
    tenant = Tenant(name=f"Tenant {slug}", slug=slug, status=TenantStatus.active)
    if deleted:
        tenant.deleted_at = _now()
    session.add(tenant)
    await session.flush()
    return tenant


async def _plan(session, code: str) -> Plan:
    plan = Plan(
        code=code,
        name=f"Plan {code}",
        edition="business",
        default_billing_cycle="annual",
        currency="IDR",
        features={},
        is_active=True,
    )
    session.add(plan)
    await session.flush()
    return plan


async def _invoice(
    session,
    tenant_id: str,
    *,
    status: InvoiceStatus,
    total: int,
    currency: str = "IDR",
    due_date: datetime | None = None,
    paid_at: datetime | None = None,
) -> Invoice:
    inv = Invoice(
        invoice_number=await billing_service.next_invoice_number(session),
        tenant_id=tenant_id,
        period_start=_now(),
        period_end=_now() + timedelta(days=30),
        total=total,
        currency=currency,
        status=status,
        issued_at=_now() if status != InvoiceStatus.draft else None,
        due_date=due_date,
        paid_at=paid_at,
    )
    session.add(inv)
    await session.flush()
    return inv


@pytest.mark.asyncio
async def test_summary_on_empty_platform_is_all_zeros():
    async with platform_session() as session:
        summary = await billing_service.operational_summary(session)

    assert summary["unpaid"]["count"] == 0
    assert summary["unpaid"]["by_currency"] == []
    assert summary["overdue"]["count"] == 0
    assert summary["tenants_without_subscription"] == 0


@pytest.mark.asyncio
async def test_unpaid_and_overdue_buckets():
    """Overdue is a subset of unpaid — a late invoice appears in both."""
    async with platform_session() as session:
        tenant = await _tenant(session, "buckets")

        # Issued, deadline already passed.
        await _invoice(
            session, tenant.id, status=InvoiceStatus.issued,
            total=1000, due_date=_now() - timedelta(days=3),
        )
        # Issued, deadline still ahead.
        await _invoice(
            session, tenant.id, status=InvoiceStatus.issued,
            total=500, due_date=_now() + timedelta(days=10),
        )

        summary = await billing_service.operational_summary(session)

    assert summary["unpaid"]["count"] == 2
    assert summary["unpaid"]["by_currency"] == [{"currency": "IDR", "total": 1500}]
    assert summary["overdue"]["count"] == 1
    assert summary["overdue"]["by_currency"] == [{"currency": "IDR", "total": 1000}]


@pytest.mark.asyncio
async def test_draft_without_due_date_is_never_overdue():
    """The backfill leaves drafts NULL; they must not read as arrears."""
    async with platform_session() as session:
        tenant = await _tenant(session, "draft-only")
        await _invoice(
            session, tenant.id, status=InvoiceStatus.draft, total=900, due_date=None
        )

        summary = await billing_service.operational_summary(session)

    assert summary["draft"]["count"] == 1
    assert summary["overdue"]["count"] == 0
    assert summary["unpaid"]["count"] == 0


@pytest.mark.asyncio
async def test_paid_invoice_is_never_overdue_however_late():
    """A settled invoice drops out of chasing even if its deadline passed."""
    async with platform_session() as session:
        tenant = await _tenant(session, "paid-late")
        await _invoice(
            session, tenant.id, status=InvoiceStatus.paid, total=700,
            due_date=_now() - timedelta(days=60), paid_at=_now(),
        )

        summary = await billing_service.operational_summary(session)

    assert summary["overdue"]["count"] == 0
    assert summary["unpaid"]["count"] == 0
    assert summary["paid_this_month"]["count"] == 1


@pytest.mark.asyncio
async def test_currencies_are_reported_separately():
    """Summing IDR and USD would produce a number that means nothing."""
    async with platform_session() as session:
        tenant = await _tenant(session, "multi-currency")
        due = _now() + timedelta(days=5)
        await _invoice(
            session, tenant.id, status=InvoiceStatus.issued,
            total=1_000_000, currency="IDR", due_date=due,
        )
        await _invoice(
            session, tenant.id, status=InvoiceStatus.issued,
            total=250, currency="USD", due_date=due,
        )

        summary = await billing_service.operational_summary(session)

    assert summary["unpaid"]["count"] == 2
    by_currency = {row["currency"]: row["total"] for row in summary["unpaid"]["by_currency"]}
    assert by_currency == {"IDR": 1_000_000, "USD": 250}


@pytest.mark.asyncio
async def test_paid_this_month_excludes_earlier_months():
    async with platform_session() as session:
        tenant = await _tenant(session, "paid-window")
        month_start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        await _invoice(
            session, tenant.id, status=InvoiceStatus.paid, total=100,
            paid_at=month_start + timedelta(hours=1),
        )
        await _invoice(
            session, tenant.id, status=InvoiceStatus.paid, total=999,
            paid_at=month_start - timedelta(days=1),
        )

        summary = await billing_service.operational_summary(session)

    assert summary["paid_this_month"]["count"] == 1
    assert summary["paid_this_month"]["by_currency"] == [{"currency": "IDR", "total": 100}]


@pytest.mark.asyncio
async def test_lapse_signals_respect_their_windows():
    async with platform_session() as session:
        plan = await _plan(session, "lapse-plan")

        def _sub(tenant, **kwargs):
            defaults = {
                "tenant_id": tenant.id,
                "plan_id": plan.id,
                "billing_cycle": "annual",
                "discount_pct": 0,
                "starts_at": _now(),
                "ends_at": _now() + timedelta(days=365),
                "status": SubscriptionStatus.active,
            }
            defaults.update(kwargs)
            return TenantSubscription(**defaults)

        # Trial ending inside the 7-day window, and one well outside it.
        session.add(_sub(
            await _tenant(session, "trial-soon"),
            status=SubscriptionStatus.trial,
            trial_ends_at=_now() + timedelta(days=3),
        ))
        session.add(_sub(
            await _tenant(session, "trial-later"),
            status=SubscriptionStatus.trial,
            trial_ends_at=_now() + timedelta(days=30),
        ))
        session.add(_sub(await _tenant(session, "past-due"), status=SubscriptionStatus.past_due))
        # Active subscription ending inside the 30-day window.
        session.add(_sub(
            await _tenant(session, "ending-soon"),
            ends_at=_now() + timedelta(days=10),
        ))
        await session.flush()

        summary = await billing_service.operational_summary(session)

    assert summary["trials_ending"] == 1
    assert summary["past_due_count"] == 1
    assert summary["subscriptions_ending"] == 1


@pytest.mark.asyncio
async def test_tenants_without_subscription_ignores_deleted_tenants():
    """A tenant on its way out is not a gap worth reporting forever."""
    async with platform_session() as session:
        plan = await _plan(session, "cover-plan")

        await _tenant(session, "uncovered")
        await _tenant(session, "soft-deleted", deleted=True)

        covered = await _tenant(session, "covered")
        session.add(TenantSubscription(
            tenant_id=covered.id,
            plan_id=plan.id,
            billing_cycle="annual",
            discount_pct=0,
            starts_at=_now(),
            ends_at=_now() + timedelta(days=365),
            status=SubscriptionStatus.active,
        ))
        await session.flush()

        summary = await billing_service.operational_summary(session)

    assert summary["tenants_without_subscription"] == 1


@pytest.mark.asyncio
async def test_summary_endpoint_returns_zeros_not_404(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    resp = await client.get(
        "/api/v1/billing/summary", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["unpaid"]["count"] == 0
    assert data["trials_ending"] == 0


@pytest.mark.asyncio
async def test_summary_endpoint_refuses_tenant_admin(client: AsyncClient, super_admin):
    """Platform-wide figures are super-admin only."""
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/tenants",
        headers=headers,
        json={
            "name": "Summary Tenant",
            "slug": "summary-tenant",
            "admin_email": "admin@summary-tenant.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin Summary",
        },
    )
    assert resp.status_code == 201, resp.text

    tenant_token = await _token(
        client, email="admin@summary-tenant.app", password="adminpass123"
    )
    resp = await client.get(
        "/api/v1/billing/summary",
        headers={"Authorization": f"Bearer {tenant_token}"},
    )
    assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# due_date rules
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_issuing_an_invoice_derives_due_date_from_net_terms(
    client: AsyncClient, super_admin
):
    from app.core.config import settings

    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    tenant_id = await _create_tenant_via_api(client, token, "net-terms")

    resp = await client.post(
        "/api/v1/billing/invoices",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "period_start": _now().isoformat(),
            "period_end": (_now() + timedelta(days=30)).isoformat(),
            "total": 5000,
        },
    )
    assert resp.status_code == 201, resp.text
    inv = resp.json()["data"]
    assert inv["due_date"] is None  # draft carries no deadline

    resp = await client.patch(
        f"/api/v1/billing/invoices/{inv['id']}",
        headers={**headers, "X-Tenant-Id": "*"},
        json={"status": "issued"},
    )
    assert resp.status_code == 200, resp.text
    issued = resp.json()["data"]

    issued_at = datetime.fromisoformat(issued["issued_at"])
    due_date = datetime.fromisoformat(issued["due_date"])
    assert (due_date - issued_at).days == settings.invoice_net_days


@pytest.mark.asyncio
async def test_explicit_due_date_survives_issuing(client: AsyncClient, super_admin):
    """Negotiated terms must not be overwritten by the default net terms."""
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    tenant_id = await _create_tenant_via_api(client, token, "explicit-terms")

    resp = await client.post(
        "/api/v1/billing/invoices",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "period_start": _now().isoformat(),
            "period_end": (_now() + timedelta(days=30)).isoformat(),
            "total": 5000,
        },
    )
    inv = resp.json()["data"]

    negotiated = (_now() + timedelta(days=45)).replace(microsecond=0)
    resp = await client.patch(
        f"/api/v1/billing/invoices/{inv['id']}",
        headers={**headers, "X-Tenant-Id": "*"},
        json={"status": "issued", "due_date": negotiated.isoformat()},
    )
    assert resp.status_code == 200, resp.text
    due_date = datetime.fromisoformat(resp.json()["data"]["due_date"])
    assert due_date == negotiated
