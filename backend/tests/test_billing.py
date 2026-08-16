"""BILLING-1: comprehensive tests for billing service and API endpoints.

Tests cover:
- Plan CRUD (create, read, update, delete)
- Plan tier CRUD
- Subscription lifecycle (create, update status, cancel)
- Invoice generation and updates
- Usage snapshot recording
- Feature gating via require_feature
- Tenant isolation (explicit tenant_id filtering)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionFactory, _set_tenant
from app.models import (
    Invoice,
    InvoiceLine,
    InvoiceStatus,
    Plan,
    PlanTier,
    Role,
    SubscriptionStatus,
    Tenant,
    TenantStatus,
    TenantSubscription,
    UsageSnapshot,
)


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


def _platform_headers(token: str) -> dict[str, str]:
    """Auth headers for a super admin acting across every tenant.

    Billing endpoints that touch tenant-scoped rows open their session via
    ``get_db``, which refuses an ambiguous scope: a super admin's JWT carries
    no tenant, so ``X-Tenant-Id`` has to say which one — or ``*`` for all of
    them. Tests that omitted the header got 400, not the 200 they asserted.
    """
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": "*"}


async def _create_tenant_in_session(session: AsyncSession, slug: str) -> str:
    """Create a real tenant row directly in the session and return its id.

    Service-level tests used to invent ids like ``"tenant-a"``. Every
    tenant-scoped table carries a foreign key to ``tenants``, so those inserts
    died on ForeignKeyViolationError the first time the suite actually ran.
    """
    tenant = Tenant(name=f"Test {slug}", slug=slug, status=TenantStatus.active)
    session.add(tenant)
    await session.flush()
    return tenant.id


async def _create_tenant(client: AsyncClient, super_admin_token: str, slug: str = "test-tenant") -> str:
    """Create a tenant and return its ID."""
    resp = await client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {super_admin_token}"},
        json={
            "name": f"Test Tenant {slug}",
            "slug": slug,
            "admin_email": f"admin@{slug}.app",
            "admin_password": "adminpass123",
            "admin_full_name": f"Admin {slug}",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _get_plan(session: AsyncSession, plan_id: str) -> Plan:
    stmt = select(Plan).where(Plan.id == plan_id)
    return (await session.execute(stmt)).scalar_one()


async def _get_subscription(session: AsyncSession, sub_id: str) -> TenantSubscription:
    stmt = select(TenantSubscription).where(TenantSubscription.id == sub_id)
    return (await session.execute(stmt)).scalar_one()


# --------------------------------------------------------------------------- #
# Plan CRUD
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_create_plan(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "starter",
            "name": "Starter Plan",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
            "features": {"billing.enabled": True},
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["code"] == "starter"
    assert data["name"] == "Starter Plan"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_list_plans(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a plan first
    await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "test-plan",
            "name": "Test Plan",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )

    resp = await client.get("/api/v1/billing/plans", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_update_plan(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a plan
    create_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "update-test",
            "name": "Before Update",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = create_resp.json()["data"]["id"]

    # Update it
    resp = await client.patch(
        f"/api/v1/billing/plans/{plan_id}",
        headers=headers,
        json={"name": "After Update"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "After Update"


@pytest.mark.asyncio
async def test_delete_plan(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a plan
    create_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "delete-test",
            "name": "To Delete",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = create_resp.json()["data"]["id"]

    # Delete it
    resp = await client.delete(f"/api/v1/billing/plans/{plan_id}", headers=headers)
    assert resp.status_code == 204


# --------------------------------------------------------------------------- #
# Plan Tier CRUD
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_create_plan_tier(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a plan first
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "tier-test",
            "name": "Tier Test Plan",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    # Create a tier
    resp = await client.post(
        f"/api/v1/billing/plans/{plan_id}/tiers",
        headers=headers,
        json={
            "min_users": 1,
            "max_users": 100,
            "unit_price": 50000,
            "min_charge": 50000,
            "sort_order": 1,
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["min_users"] == 1
    assert data["max_users"] == 100
    assert data["unit_price"] == 50000


@pytest.mark.asyncio
async def test_list_plan_tiers(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a plan
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "list-tier-test",
            "name": "List Tier Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    # Create multiple tiers
    for i in range(3):
        await client.post(
            f"/api/v1/billing/plans/{plan_id}/tiers",
            headers=headers,
            json={
                "min_users": (i + 1) * 50,
                "max_users": (i + 2) * 50,
                "unit_price": 50000 * (i + 1),
                "min_charge": 50000,
                "sort_order": i + 1,
            },
        )

    resp = await client.get(f"/api/v1/billing/plans/{plan_id}/tiers", headers=headers)
    assert resp.status_code == 200
    tiers = resp.json()["data"]
    assert len(tiers) == 3


@pytest.mark.asyncio
async def test_delete_plan_tier(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a plan
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "delete-tier-test",
            "name": "Delete Tier Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    # Create a tier
    tier_resp = await client.post(
        f"/api/v1/billing/plans/{plan_id}/tiers",
        headers=headers,
        json={
            "min_users": 1,
            "max_users": 50,
            "unit_price": 50000,
            "min_charge": 50000,
            "sort_order": 1,
        },
    )
    tier_id = tier_resp.json()["data"]["id"]

    # Delete it
    resp = await client.delete(
        f"/api/v1/billing/plans/{plan_id}/tiers/{tier_id}",
        headers=headers,
    )
    assert resp.status_code == 204


# --------------------------------------------------------------------------- #
# Subscription lifecycle
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_create_subscription(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a tenant and plan
    tenant_id = await _create_tenant(client, token)
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "sub-test",
            "name": "Subscription Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    # Create subscription
    resp = await client.post(
        "/api/v1/billing/subscriptions",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "billing_cycle": "annual",
            "discount_pct": 0,
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["tenant_id"] == tenant_id
    assert data["plan_id"] == plan_id
    assert data["status"] == "trial"  # Default status


@pytest.mark.asyncio
async def test_update_subscription_status(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a tenant and subscription
    tenant_id = await _create_tenant(client, token)
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "status-test",
            "name": "Status Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    sub_resp = await client.post(
        "/api/v1/billing/subscriptions",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "billing_cycle": "annual",
            "discount_pct": 0,
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        },
    )
    sub_id = sub_resp.json()["data"]["id"]

    # Update status to active — tenant-scoped endpoint, needs an explicit scope
    resp = await client.patch(
        f"/api/v1/billing/subscriptions/{sub_id}",
        headers=_platform_headers(token),
        json={"status": "active"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "active"


@pytest.mark.asyncio
async def test_cancel_subscription(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a tenant and subscription
    tenant_id = await _create_tenant(client, token)
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "cancel-test",
            "name": "Cancel Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    sub_resp = await client.post(
        "/api/v1/billing/subscriptions",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "billing_cycle": "annual",
            "discount_pct": 0,
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        },
    )
    sub_id = sub_resp.json()["data"]["id"]

    # Cancel subscription
    resp = await client.delete(
        f"/api/v1/billing/subscriptions/{sub_id}",
        headers=headers,
    )
    assert resp.status_code == 204

    # Verify status changed
    async with SessionFactory() as s:
        await _set_tenant(s, None, platform=True)
        sub = await _get_subscription(s, sub_id)
        assert sub.status == SubscriptionStatus.canceled


# --------------------------------------------------------------------------- #
# Invoice operations
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_create_invoice(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a tenant and subscription
    tenant_id = await _create_tenant(client, token)
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "invoice-test",
            "name": "Invoice Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    sub_resp = await client.post(
        "/api/v1/billing/subscriptions",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "billing_cycle": "annual",
            "discount_pct": 0,
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        },
    )
    sub_id = sub_resp.json()["data"]["id"]

    # Create invoice (this would normally be done by an invoice generation service)
    resp = await client.post(
        "/api/v1/billing/invoices",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "subscription_id": sub_id,
            "period_start": datetime.now(timezone.utc).isoformat(),
            "period_end": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
            "billed_users": 50,
            "tier_id": None,
            "subtotal": 2500000,
            "discount": 0,
            "tax_pct": 11,
            "tax_amount": 275000,
            "total": 2775000,
            "currency": "IDR",
            "status": "draft",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["billed_users"] == 50
    assert data["total"] == 2775000


@pytest.mark.asyncio
async def test_list_invoices(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a tenant and subscription
    tenant_id = await _create_tenant(client, token)
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "list-inv-test",
            "name": "List Invoice Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    sub_resp = await client.post(
        "/api/v1/billing/subscriptions",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "billing_cycle": "annual",
            "discount_pct": 0,
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        },
    )
    sub_id = sub_resp.json()["data"]["id"]

    # Create an invoice
    await client.post(
        "/api/v1/billing/invoices",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "subscription_id": sub_id,
            "period_start": datetime.now(timezone.utc).isoformat(),
            "period_end": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
            "billed_users": 50,
            "tier_id": None,
            "subtotal": 2500000,
            "discount": 0,
            "tax_pct": 11,
            "tax_amount": 275000,
            "total": 2775000,
            "currency": "IDR",
            "status": "draft",
        },
    )

    # List invoices — tenant-scoped endpoint, needs an explicit scope
    resp = await client.get("/api/v1/billing/invoices", headers=_platform_headers(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_update_invoice(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create a tenant and subscription
    tenant_id = await _create_tenant(client, token)
    plan_resp = await client.post(
        "/api/v1/billing/plans",
        headers=headers,
        json={
            "code": "update-inv-test",
            "name": "Update Invoice Test",
            "edition": "business",
            "default_billing_cycle": "annual",
            "currency": "IDR",
        },
    )
    plan_id = plan_resp.json()["data"]["id"]

    sub_resp = await client.post(
        "/api/v1/billing/subscriptions",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "billing_cycle": "annual",
            "discount_pct": 0,
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        },
    )
    sub_id = sub_resp.json()["data"]["id"]

    # Create an invoice
    inv_resp = await client.post(
        "/api/v1/billing/invoices",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "subscription_id": sub_id,
            "period_start": datetime.now(timezone.utc).isoformat(),
            "period_end": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
            "billed_users": 50,
            "tier_id": None,
            "subtotal": 2500000,
            "discount": 0,
            "tax_pct": 11,
            "tax_amount": 275000,
            "total": 2775000,
            "currency": "IDR",
            "status": "draft",
        },
    )
    assert inv_resp.status_code == 201, inv_resp.text
    inv_id = inv_resp.json()["data"]["id"]

    # Update invoice status to issued
    resp = await client.patch(
        f"/api/v1/billing/invoices/{inv_id}",
        headers=_platform_headers(token),
        json={"status": "issued"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert body["status"] == "issued"
    # Issuing stamps both dates; the deadline follows the default net terms.
    assert body["issued_at"] is not None
    assert body["due_date"] is not None


# --------------------------------------------------------------------------- #
# Usage snapshots
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_list_usage_snapshots(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/v1/billing/usage", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_usage_snapshot_idempotent():
    """Usage snapshot should be idempotent — updating same tenant+date is allowed."""
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)

        from app.services import billing_service

        tenant_id = await _create_tenant_in_session(session, "usage-idem")
        snap_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # First record
        snap1 = await billing_service.record_usage_snapshot(
            session, tenant_id, snap_date, active_users=10, devices=5, punches=100
        )
        assert snap1 is not None

        # Second record with higher values (should update)
        snap2 = await billing_service.record_usage_snapshot(
            session, tenant_id, snap_date, active_users=20, devices=8, punches=200
        )
        assert snap2 is not None
        assert snap2.active_users == 20
        assert snap2.devices == 8
        assert snap2.punches == 200


# --------------------------------------------------------------------------- #
# Tenant isolation
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_tenant_isolation_subscriptions():
    """Subscriptions are scoped by tenant_id — explicit WHERE clause, not RLS."""
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)

        # Create two subscriptions for different tenants
        plan_resp = await _create_plan_in_session(session, "iso-test")
        tenant_a = await _create_tenant_in_session(session, "iso-tenant-a")
        tenant_b = await _create_tenant_in_session(session, "iso-tenant-b")
        sub1 = TenantSubscription(
            tenant_id=tenant_a,
            plan_id=plan_resp.id,
            billing_cycle="annual",
            discount_pct=0,
            starts_at=datetime.now(timezone.utc),
            ends_at=datetime.now(timezone.utc) + timedelta(days=365),
            status=SubscriptionStatus.trial,
        )
        sub2 = TenantSubscription(
            tenant_id=tenant_b,
            plan_id=plan_resp.id,
            billing_cycle="annual",
            discount_pct=0,
            starts_at=datetime.now(timezone.utc),
            ends_at=datetime.now(timezone.utc) + timedelta(days=365),
            status=SubscriptionStatus.trial,
        )
        session.add(sub1)
        session.add(sub2)
        await session.flush()

        # Query with explicit tenant_id filter
        stmt = select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_a)
        result = await session.execute(stmt)
        subs = list(result.scalars())
        assert len(subs) == 1
        assert subs[0].tenant_id == tenant_a


async def _create_plan_in_session(session: AsyncSession, code: str) -> Plan:
    """Helper to create a plan directly in session."""
    plan = Plan(
        code=code,
        name=f"Test Plan {code}",
        edition="business",
        default_billing_cycle="annual",
        currency="IDR",
        features={},
        is_active=True,
    )
    session.add(plan)
    await session.flush()
    return plan


# --------------------------------------------------------------------------- #
# Feature gating
# --------------------------------------------------------------------------- #
# ``require_feature`` is a plain coroutine taking (feature, principal, session)
# — not a dependency factory. These tests used to call it as
# ``require_feature("x")(MockPlan())``, which merely built a coroutine and then
# tried to call it, raising TypeError before any assertion could run.
#
# Note the gate resolves "the plan" as *any* active plan carrying a tier, not
# the plan the tenant is actually subscribed to. That is worth revisiting, but
# the function has no callers in app/ today, so these tests pin the behaviour
# as it stands rather than the behaviour it arguably should have.
@pytest.mark.asyncio
async def test_require_feature_check():
    """A feature enabled on the active plan passes the gate."""
    from fastapi import HTTPException  # noqa: F401  (symmetry with the test below)

    from app.api.deps import Principal, require_feature

    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        tenant_id = await _create_tenant_in_session(session, "feature-on")
        plan = await _create_plan_in_session(session, "feature-on-plan")
        plan.features = {"billing": {"enabled": True}}
        session.add(
            PlanTier(plan_id=plan.id, min_users=1, unit_price=0, min_charge=0)
        )
        await session.flush()

        principal = Principal(
            subject="user-1", role=Role.tenant_admin, tenant_id=tenant_id
        )
        # Does not raise.
        await require_feature("billing.enabled", principal, session)


@pytest.mark.asyncio
async def test_require_feature_missing():
    """A feature absent from the active plan is refused with 403."""
    from fastapi import HTTPException

    from app.api.deps import Principal, require_feature

    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)
        tenant_id = await _create_tenant_in_session(session, "feature-off")
        plan = await _create_plan_in_session(session, "feature-off-plan")
        plan.features = {}
        session.add(
            PlanTier(plan_id=plan.id, min_users=1, unit_price=0, min_charge=0)
        )
        await session.flush()

        principal = Principal(
            subject="user-1", role=Role.tenant_admin, tenant_id=tenant_id
        )
        with pytest.raises(HTTPException) as exc:
            await require_feature("billing.enabled", principal, session)
        assert exc.value.status_code == 403


# --------------------------------------------------------------------------- #
# Billing service tests
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_billing_service_get_plan_by_code():
    """Test getting plan by code."""
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)

        from app.services import billing_service

        # clean_db truncates every table before each test, so the plan this
        # looks up has to be created here. It used to assume a "starter" plan
        # survived from some earlier test.
        await _create_plan_in_session(session, "starter")

        plan = await billing_service.get_plan_by_code(session, "starter")
        assert plan is not None
        assert plan.code == "starter"


@pytest.mark.asyncio
async def test_billing_service_get_subscription_by_tenant():
    """Test getting subscription by tenant."""
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)

        from app.services import billing_service

        # This will raise if no subscription exists for tenant
        with pytest.raises(Exception):
            await billing_service.get_subscription_by_tenant(session, "nonexistent-tenant")


@pytest.mark.asyncio
async def test_billing_service_create_invoice():
    """Test invoice creation."""
    async with SessionFactory() as session:
        await _set_tenant(session, None, platform=True)

        from app.services import billing_service

        # Create a mock subscription
        plan = await _create_plan_in_session(session, "inv-svc-test")
        tenant_id = await _create_tenant_in_session(session, "inv-svc-tenant")
        sub = TenantSubscription(
            tenant_id=tenant_id,
            plan_id=plan.id,
            billing_cycle="annual",
            discount_pct=0,
            starts_at=datetime.now(timezone.utc),
            ends_at=datetime.now(timezone.utc) + timedelta(days=365),
            status=SubscriptionStatus.active,
        )
        session.add(sub)
        await session.flush()

        # Create invoice
        invoice = await billing_service.create_invoice(
            session,
            tenant_id=tenant_id,
            subscription_id=sub.id,
            period_start=datetime.now(timezone.utc).isoformat(),
            period_end=(datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
            billed_users=50,
            tier_id=None,
            subtotal=2500000,
            discount=0,
            tax_pct=11,
            tax_amount=275000,
            total=2775000,
            currency="IDR",
        )
        assert invoice is not None
        assert invoice.tenant_id == tenant_id
        assert invoice.total == 2775000
        # The service reserves the number itself — it is NOT NULL and unique,
        # so leaving it unset used to make this call fail outright.
        assert invoice.invoice_number.startswith("INV-")
