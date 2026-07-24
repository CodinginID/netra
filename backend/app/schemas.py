"""Pydantic schemas for request/response payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Generic, Literal, TypeVar
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import (
    ApiKeyStatus,
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
# Pagination
# --------------------------------------------------------------------------- #
class PageData(BaseModel, Generic[T]):
    """Paginated response data: {"items": [...], "total": N, "page": 1, "limit": 20, "pages": 5}."""

    items: list[T]
    total: int
    page: int
    limit: int
    pages: int


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    # Email is the global login identifier for staff. tenant_id is derived from the
    # matched user and baked into the JWT — no slug needed.
    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: Role


class EmailCheckRequest(BaseModel):
    email: EmailStr


class EmailCheckResponse(BaseModel):
    exists: bool


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


# --------------------------------------------------------------------------- #
# Tenant
# --------------------------------------------------------------------------- #
class TenantCreate(BaseModel):
    name: str = Field(min_length=2)
    slug: str = Field(min_length=2, pattern=r"^[a-z0-9-]+$")
    # The client's tenant admin logs in by email (global identifier).
    admin_email: EmailStr
    admin_password: str = Field(min_length=8)
    admin_full_name: str = Field(min_length=2)
    admin_username: str | None = Field(default=None, min_length=3)  # optional display handle
    config: "TenantConfig | None" = None


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    status: TenantStatus
    config: dict
    created_at: datetime
    onboarding_completed_at: datetime | None = None


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


class RecognitionConfig(BaseModel):
    # Per-tenant override of the global match threshold (None => use the default).
    match_threshold: float | None = Field(default=None, ge=0.0, le=1.0)


class VerticalConfig(BaseModel):
    mode: Literal["company", "school", "university"] = "company"


class EmbedConfig(BaseModel):
    """Embed integration prefs. Origin allowlisting lives per API key (see
    ``ApiKeyCreate.allowed_origins``), not here — this is a placeholder for
    future tenant-wide embed prefs."""


class TenantConfig(BaseModel):
    """Per-tenant config space. Stored in tenants.config (JSONB)."""

    vertical: VerticalConfig = Field(default_factory=VerticalConfig)
    branding: BrandingConfig = Field(default_factory=BrandingConfig)
    attendance: AttendanceDefaults = Field(default_factory=AttendanceDefaults)
    kiosk: KioskPrefs = Field(default_factory=KioskPrefs)
    recognition: RecognitionConfig = Field(default_factory=RecognitionConfig)
    embed: EmbedConfig = Field(default_factory=EmbedConfig)


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

    @model_validator(mode="after")
    def _check_identity_by_role(self) -> UserCreate:
        """Enforce the identity model:

        - Staff (super_admin / tenant_admin / supervisor) log in by email, so
          email + password are required.
        - End users don't log in; they are matched to client systems by
          external_id (NIS/NIM/NIK), so external_id is required.
        """
        staff = {Role.super_admin, Role.tenant_admin, Role.supervisor}
        if self.role in staff:
            if not self.email:
                raise ValueError("email is required for staff accounts")
            if not self.password:
                raise ValueError("password is required for staff accounts")
        elif self.role == Role.end_user and not self.external_id:
            raise ValueError("external_id (NIS/NIM/NIK) is required for end users")
        return self


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2)
    role: Role | None = None
    username: str | None = None
    is_active: bool | None = None


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


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


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
# API keys (server-to-server integration)
# --------------------------------------------------------------------------- #
# The scopes a tenant API key may be granted. Keep names "resource:action" so
# they read clearly in the dashboard and stay extensible.
API_SCOPES: dict[str, str] = {
    "attendance:read": "Baca catatan & laporan kehadiran",
    "users:read": "Baca daftar pengguna + status enrolled",
    "users:write": "Buat/perbarui pengguna via sinkronisasi (upsert by external_id)",
    "embed:enroll": "Mint sesi embed untuk enrollment wajah",
}


def _validate_origins(origins: list[str]) -> list[str]:
    """Each origin must be scheme+host(+port) only, e.g. 'https://app.sekolah.id'
    or 'http://localhost:7002' — no path/query/fragment (it's compared exactly
    against the browser's Origin header, which never carries one)."""
    cleaned = []
    for raw in origins:
        origin = raw.strip().rstrip("/")
        parts = urlsplit(origin)
        if parts.scheme not in ("http", "https") or not parts.netloc or parts.path:
            raise ValueError(f"Invalid origin '{raw}': expected e.g. 'https://app.example.com'")
        cleaned.append(origin)
    return cleaned


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scopes: list[str] = Field(default_factory=lambda: ["attendance:read"])
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)
    allowed_origins: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_scopes(self) -> ApiKeyCreate:
        if not self.scopes:
            raise ValueError("At least one scope is required")
        invalid = [s for s in self.scopes if s not in API_SCOPES]
        if invalid:
            raise ValueError(f"Unknown scope(s): {', '.join(invalid)}")
        self.allowed_origins = _validate_origins(self.allowed_origins)
        return self


class ApiKeyUpdate(BaseModel):
    """Partial update — currently only the origin allowlist is editable."""

    allowed_origins: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate(self) -> ApiKeyUpdate:
        self.allowed_origins = _validate_origins(self.allowed_origins)
        return self


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    prefix: str
    scopes: list[str]
    allowed_origins: list[str]
    status: ApiKeyStatus
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime


class ApiKeyCreated(ApiKeyOut):
    """Returned ONCE on creation / rotation — carries the plaintext key.

    Only the hash is persisted, so the key can never be retrieved again.
    """

    key: str


# --------------------------------------------------------------------------- #
# Embed sessions (render netra enrollment inside a client app)
# --------------------------------------------------------------------------- #
class EmbedSessionCreate(BaseModel):
    external_id: str = Field(min_length=1, max_length=255)
    full_name: str | None = Field(default=None, max_length=255)
    return_origin: str = Field(min_length=1, max_length=1024)
    is_minor: bool = False
    purpose: Literal["enroll"] = "enroll"


class EmbedSessionMinted(BaseModel):
    """Returned ONCE on mint — the token lives only inside ``url``."""

    token: str
    url: str
    expires_at: datetime


class EmbedSessionInfo(BaseModel):
    """Bootstrap context for the embed page (no secret)."""

    purpose: str
    external_id: str | None
    full_name: str | None
    is_minor: bool
    return_origin: str
    expires_at: datetime | None = None


class IntegrationUserOut(BaseModel):
    """End-user row exposed to the integration pull API (subset of UserOut)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    external_id: str | None
    enrolled: bool
    is_active: bool
    created_at: datetime


class IntegrationUserUpsert(BaseModel):
    """One end-user to create-or-update, keyed by the client's external_id."""

    external_id: str = Field(min_length=1, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)


class IntegrationUserUpsertOut(IntegrationUserOut):
    """Upsert result row — ``created`` distinguishes insert from update."""

    created: bool


# --------------------------------------------------------------------------- #
# Schedules (attendance rules)
# --------------------------------------------------------------------------- #
class ScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    rules: dict = Field(default_factory=dict)  # e.g. {"workday_start": "08:00", ...}
    grace_minutes: int = Field(default=0, ge=0, le=240)
    geofence: dict | None = None
    is_default: bool = False


class ScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    rules: dict | None = None
    grace_minutes: int | None = Field(default=None, ge=0, le=240)
    geofence: dict | None = None
    is_default: bool | None = None


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
    # {"lat": float, "lng": float, "outside_geofence": bool} — captured at punch.
    location: dict | None = None
    created_at: datetime


class AttendanceResult(BaseModel):
    """Returned to a kiosk after a successful check-in / check-out."""

    user_id: str
    full_name: str
    similarity: float
    attendance: AttendanceOut


# --------------------------------------------------------------------------- #
# Webhooks
# --------------------------------------------------------------------------- #
class WebhookCreate(BaseModel):
    url: str = Field(min_length=1, max_length=1024)
    events: list[str] = Field(min_length=1)  # e.g. ["attendance.check_in"]


class WebhookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str
    events: list[str]
    is_enabled: bool
    created_at: datetime


class WebhookRegistered(WebhookOut):
    """Returned ONCE on registration — carries the plaintext signing secret.

    Only the secret is needed by the subscriber to verify HMAC signatures; it is
    stored server-side but never returned again after creation.
    """

    secret: str
