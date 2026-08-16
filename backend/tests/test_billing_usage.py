"""Tests for per-tenant usage monitoring.

Covers the by-tenant aggregation (latest snapshot, 7-day trend, tier headroom)
and the access rules on the raw snapshot listing, which used to lock out the
very tenant admins whose own page calls it.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.db.session import SessionFactory, _set_tenant
from app.models import (
    Plan,
    PlanTier,
    SubscriptionStatus,
    Tenant,
    TenantStatus,
    TenantSubscription,
    UsageSnapshot,
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


async def _token(client: AsyncClient, **payload) -> str:
    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


async def _tenant(session, slug: str) -> Tenant:
    tenant = Tenant(name=f"Tenant {slug}", slug=slug, status=TenantStatus.active)
    session.add(tenant)
    await session.flush()
    return tenant


async def _snapshot(session, tenant_id: str, *, days_ago: int, active_users: int) -> None:
    session.add(
        UsageSnapshot(
            tenant_id=tenant_id,
            snapshot_date=_now() - timedelta(days=days_ago),
            active_users=active_users,
            devices=2,
            punches=active_users * 3,
        )
    )
    await session.flush()


async def _plan_with_tier(session, code: str, max_users: int | None) -> Plan:
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
    session.add(
        PlanTier(plan_id=plan.id, min_users=1, max_users=max_users, unit_price=0, min_charge=0)
    )
    await session.flush()
    return plan


async def _subscribe(session, tenant_id: str, plan_id: str) -> None:
    session.add(
        TenantSubscription(
            tenant_id=tenant_id,
            plan_id=plan_id,
            billing_cycle="annual",
            discount_pct=0,
            starts_at=_now(),
            ends_at=_now() + timedelta(days=365),
            status=SubscriptionStatus.active,
        )
    )
    await session.flush()


@pytest.mark.asyncio
async def test_by_tenant_is_empty_before_the_job_has_ever_run():
    async with platform_session() as session:
        rows = await billing_service.usage_by_tenant(session)
    assert rows == []


@pytest.mark.asyncio
async def test_by_tenant_returns_only_the_latest_snapshot_per_tenant():
    async with platform_session() as session:
        tenant = await _tenant(session, "latest-only")
        await _snapshot(session, tenant.id, days_ago=10, active_users=5)
        await _snapshot(session, tenant.id, days_ago=1, active_users=9)

        rows = await billing_service.usage_by_tenant(session)

    assert len(rows) == 1
    assert rows[0]["active_users"] == 9


@pytest.mark.asyncio
async def test_trend_compares_against_a_snapshot_a_week_old():
    async with platform_session() as session:
        tenant = await _tenant(session, "trend")
        await _snapshot(session, tenant.id, days_ago=10, active_users=4)
        await _snapshot(session, tenant.id, days_ago=0, active_users=11)

        rows = await billing_service.usage_by_tenant(session)

    assert rows[0]["active_users_delta_7d"] == 7


@pytest.mark.asyncio
async def test_trend_is_none_when_there_is_nothing_to_compare_against():
    """A brand-new tenant has no history — that is not the same as 'flat'."""
    async with platform_session() as session:
        tenant = await _tenant(session, "no-history")
        await _snapshot(session, tenant.id, days_ago=0, active_users=3)

        rows = await billing_service.usage_by_tenant(session)

    assert rows[0]["active_users_delta_7d"] is None


@pytest.mark.asyncio
async def test_over_tier_boundary_is_exclusive():
    """Exactly at max_users is still inside the tier; one above is over."""
    async with platform_session() as session:
        plan = await _plan_with_tier(session, "tier-10", max_users=10)

        at_limit = await _tenant(session, "at-limit")
        await _subscribe(session, at_limit.id, plan.id)
        await _snapshot(session, at_limit.id, days_ago=0, active_users=10)

        over = await _tenant(session, "over-limit")
        await _subscribe(session, over.id, plan.id)
        await _snapshot(session, over.id, days_ago=0, active_users=11)

        rows = {r["tenant_id"]: r for r in await billing_service.usage_by_tenant(session)}

    assert rows[at_limit.id]["over_tier"] is False
    assert rows[over.id]["over_tier"] is True


@pytest.mark.asyncio
async def test_tenant_without_subscription_still_appears():
    """Usage is worth seeing even when nobody is billing for it yet."""
    async with platform_session() as session:
        tenant = await _tenant(session, "unbilled")
        await _snapshot(session, tenant.id, days_ago=0, active_users=6)

        rows = await billing_service.usage_by_tenant(session)

    assert len(rows) == 1
    assert rows[0]["plan_name"] is None
    assert rows[0]["over_tier"] is False


@pytest.mark.asyncio
async def test_by_tenant_endpoint_requires_super_admin(client: AsyncClient, super_admin):
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/tenants",
        headers=headers,
        json={
            "name": "Usage Tenant",
            "slug": "usage-tenant",
            "admin_email": "admin@usage-tenant.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin Usage",
        },
    )
    assert resp.status_code == 201, resp.text

    tenant_token = await _token(
        client, email="admin@usage-tenant.app", password="adminpass123"
    )
    resp = await client.get(
        "/api/v1/billing/usage/by-tenant",
        headers={"Authorization": f"Bearer {tenant_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tenant_admin_can_read_its_own_usage(client: AsyncClient, super_admin):
    """The tenant billing page calls this; it used to answer 403."""
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/tenants",
        headers=headers,
        json={
            "name": "Own Usage",
            "slug": "own-usage",
            "admin_email": "admin@own-usage.app",
            "admin_password": "adminpass123",
            "admin_full_name": "Admin Own",
        },
    )
    assert resp.status_code == 201, resp.text

    tenant_token = await _token(client, email="admin@own-usage.app", password="adminpass123")
    resp = await client.get(
        "/api/v1/billing/usage",
        headers={"Authorization": f"Bearer {tenant_token}"},
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_tenant_admin_cannot_read_another_tenants_usage(
    client: AsyncClient, super_admin
):
    """tenant_id in the query string must not widen a tenant admin's scope."""
    token = await _token(client, email="owner@netra.app", password="ownerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    other_id = None
    for slug in ("spy", "victim"):
        resp = await client.post(
            "/api/v1/tenants",
            headers=headers,
            json={
                "name": f"Tenant {slug}",
                "slug": slug,
                "admin_email": f"admin@{slug}.app",
                "admin_password": "adminpass123",
                "admin_full_name": f"Admin {slug}",
            },
        )
        assert resp.status_code == 201, resp.text
        if slug == "victim":
            other_id = resp.json()["data"]["id"]

    async with platform_session() as session:
        await _snapshot(session, other_id, days_ago=0, active_users=42)
        await session.commit()

    spy_token = await _token(client, email="admin@spy.app", password="adminpass123")
    resp = await client.get(
        f"/api/v1/billing/usage?tenant_id={other_id}",
        headers={"Authorization": f"Bearer {spy_token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["items"] == []
