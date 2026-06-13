"""Pydantic schemas for request/response payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    AttendanceStatus,
    AttendanceType,
    DeviceStatus,
    Role,
    TenantStatus,
)

T = TypeVar("T")


# --------------------------------------------------------------------------- #
# Response envelope
# --------------------------------------------------------------------------- #
class Envelope(BaseModel, Generic[T]):
    """Consistent success envelope: {"data": ..., "error": null}."""

    data: T | None = None
    error: str | None = None


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    tenant_slug: str | None = None  # required for tenant users; omit for super admin


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: Role


# --------------------------------------------------------------------------- #
# Tenant
# --------------------------------------------------------------------------- #
class TenantCreate(BaseModel):
    name: str = Field(min_length=2)
    slug: str = Field(min_length=2, pattern=r"^[a-z0-9-]+$")
    admin_username: str = Field(min_length=3)
    admin_password: str = Field(min_length=8)
    admin_full_name: str = Field(min_length=2)


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    status: TenantStatus
    config: dict
    created_at: datetime


# --- Tenant configuration space (TENANT-2): branding, attendance, kiosk prefs ---
class BrandingConfig(BaseModel):
    display_name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = Field(default=None, pattern=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


class AttendanceDefaults(BaseModel):
    """Skeleton attendance rules — data, not code (PRD: per-tenant rules)."""

    grace_minutes: int = Field(default=0, ge=0, le=180)
    workday_start: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    workday_end: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    timezone: str = "Asia/Jakarta"


class KioskPrefs(BaseModel):
    require_liveness: bool = True
    allow_self_enrollment: bool = False


class TenantConfig(BaseModel):
    """Per-tenant config space. Stored in tenants.config (JSONB)."""

    branding: BrandingConfig = Field(default_factory=BrandingConfig)
    attendance: AttendanceDefaults = Field(default_factory=AttendanceDefaults)
    kiosk: KioskPrefs = Field(default_factory=KioskPrefs)


# --------------------------------------------------------------------------- #
# User
# --------------------------------------------------------------------------- #
class UserCreate(BaseModel):
    full_name: str = Field(min_length=2)
    role: Role = Role.end_user
    username: str | None = None
    email: EmailStr | None = None
    external_id: str | None = None  # NIS/NIM/NIK
    password: str | None = Field(default=None, min_length=8)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str | None
    full_name: str
    role: Role
    username: str | None
    email: str | None
    external_id: str | None
    is_active: bool
    enrolled: bool
    created_at: datetime


# --------------------------------------------------------------------------- #
# Consent (UU PDP)
# --------------------------------------------------------------------------- #
class ConsentRequest(BaseModel):
    user_id: str
    granted: bool = True
    purpose: str = "biometric_attendance"
    guardian_name: str | None = None


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    granted: bool
    purpose: str
    granted_at: datetime | None
    guardian_name: str | None


# --------------------------------------------------------------------------- #
# Device (kiosk) — AUTH-5
# --------------------------------------------------------------------------- #
class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    status: DeviceStatus
    last_seen_at: datetime | None
    created_at: datetime


class DeviceRegistered(DeviceOut):
    """Returned ONCE on registration — carries the plaintext token.

    The token is never persisted in plaintext (only its hash is stored), so it
    can never be retrieved again. The kiosk must capture it now.
    """

    token: str


# --------------------------------------------------------------------------- #
# Schedules (attendance rules)
# --------------------------------------------------------------------------- #
class ScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    rules: dict = Field(default_factory=dict)  # e.g. {"workday_start": "08:00", ...}
    grace_minutes: int = Field(default=0, ge=0, le=240)
    geofence: dict | None = None
    is_default: bool = False


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    rules: dict
    grace_minutes: int
    geofence: dict | None
    is_default: bool
    created_at: datetime


# --------------------------------------------------------------------------- #
# Enrollment & attendance (core face-recognition loop)
# --------------------------------------------------------------------------- #
class EnrollmentResult(BaseModel):
    user_id: str
    embedding_id: str
    enrolled: bool = True


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    type: AttendanceType
    status: AttendanceStatus
    occurred_at: datetime
    liveness_score: float | None
    device_id: str | None
    created_at: datetime


class AttendanceResult(BaseModel):
    """Returned to a kiosk after a successful check-in / check-out."""

    user_id: str
    full_name: str
    similarity: float
    attendance: AttendanceOut
