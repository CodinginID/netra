"""Aggregate all v1 routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    attendance,
    auth,
    consent,
    devices,
    enrollment,
    health,
    reports,
    schedules,
    tenants,
    users,
    webhooks,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(tenants.router)
api_router.include_router(users.router)
api_router.include_router(consent.router)
api_router.include_router(devices.router)
api_router.include_router(schedules.router)
api_router.include_router(enrollment.router)
api_router.include_router(attendance.router)
api_router.include_router(reports.router)
api_router.include_router(webhooks.router)
