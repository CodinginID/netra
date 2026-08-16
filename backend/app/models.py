"""ORM models — core schema (PRD §8). All tenant-scoped tables carry tenant_id.

Tables: tenants, users, face_embeddings, schedules, attendance_records,
devices, sso_connections, audit_logs, consents.
"""

from __future__ import annotations

import enum
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.config import settings
from app.db.base import Base, TimestampMixin, gen_uuid
from app.db.types import EncryptedStr, external_id_digest


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class TenantStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"


class Role(str, enum.Enum):
    super_admin = "super_admin"  # platform level
    tenant_admin = "tenant_admin"  # tenant level
    supervisor = "supervisor"  # tenant level (Supervisor/HR)
    end_user = "end_user"  # tenant level
    kiosk = "kiosk"  # tenant level (device account)


class AttendanceType(str, enum.Enum):
    check_in = "check_in"
    check_out = "check_out"


class AttendanceStatus(str, enum.Enum):
    on_time = "on_time"
    late = "late"
    early_leave = "early_leave"


class DeviceStatus(str, enum.Enum):
    active = "active"
    revoked = "revoked"


class ApiKeyStatus(str, enum.Enum):
    active = "active"
    revoked = "revoked"


class EmbedSessionStatus(str, enum.Enum):
    pending = "pending"     # minted, not yet used
    consumed = "consumed"   # enrollment succeeded, token dead


class EmbedPurpose(str, enum.Enum):
    enroll = "enroll"
    # kiosk = "kiosk"  # future phase


class Edition(str, enum.Enum):
    """Subscription edition: determines the pricing grid (education vs business)."""
    education = "education"
    business = "business"


class BillingCycle(str, enum.Enum):
    """How often the subscription renews and invoices are issued."""
    annual = "annual"
    semester = "semester"  # 6 months
    monthly = "monthly"


class SubscriptionStatus(str, enum.Enum):
    trial = "trial"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    paid = "paid"
    void = "void"


# --------------------------------------------------------------------------- #
# Platform-level
# --------------------------------------------------------------------------- #
class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    status: Mapped[TenantStatus] = mapped_column(
        Enum(TenantStatus, name="tenant_status"), default=TenantStatus.active, nullable=False
    )
    # branding, attendance defaults, kiosk prefs, etc.
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    users: Mapped[list[User]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


# --------------------------------------------------------------------------- #
# Tenant-scoped
# --------------------------------------------------------------------------- #
class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        # Uniqueness is enforced on the deterministic hash, not the encrypted
        # (non-deterministic) external_id ciphertext. See app/db/types.py.
        UniqueConstraint("tenant_id", "external_id_hash", name="uq_user_tenant_external"),
        UniqueConstraint("tenant_id", "username", name="uq_user_tenant_username"),
        # Email is the GLOBAL login identifier for staff (super_admin / tenant_admin
        # / supervisor). Stored lowercased so this plain unique is case-insensitive.
        # NULL is allowed for end_users (multiple NULLs don't conflict in Postgres).
        UniqueConstraint("email", name="uq_user_email"),
        Index("ix_users_tenant", "tenant_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    # NULL tenant_id => platform-level user (super admin). Tenant users always set.
    tenant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    # OPS-5: external_id (NIS/NIM/NIK) is sensitive PII — encrypted at rest via
    # EncryptedStr. The column holds Fernet ciphertext (much longer than the
    # plaintext), so it is widened to Text. Uniqueness is enforced on
    # external_id_hash (deterministic), kept in sync by the validator below.
    external_id: Mapped[str | None] = mapped_column(EncryptedStr(), nullable=True)
    external_id_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    username: Mapped[str | None] = mapped_column(String(150), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="user_role"), default=Role.end_user, nullable=False
    )
    # internal login (own identity store); null for pure-SSO users
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sso_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enrolled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="users")
    embeddings: Mapped[list[FaceEmbedding]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @validates("external_id")
    def _sync_external_id_hash(self, _key: str, value: str | None) -> str | None:
        """Keep the deterministic hash column in sync with external_id (OPS-5)."""
        self.external_id_hash = external_id_digest(value)
        return value

    @validates("email")
    def _normalize_email(self, _key: str, value: str | None) -> str | None:
        """Lowercase + trim email so the global unique constraint is case-insensitive."""
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None


class FaceEmbedding(Base, TimestampMixin):
    """ArcFace 512-d embedding (NOT raw photo). pgvector for similarity search."""

    __tablename__ = "face_embeddings"
    __table_args__ = (Index("ix_face_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # OPS-5: embeddings are stored as plaintext pgvector ON PURPOSE. They are
    # non-reversible mathematical templates (you cannot reconstruct a face from
    # an ArcFace vector), and pgvector similarity search (cosine via the ivfflat
    # index) requires plaintext values — encrypting them would break 1:N match.
    vector: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dim), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    user: Mapped[User] = relationship(back_populates="embeddings")


class Schedule(Base, TimestampMixin):
    """Per-tenant attendance rules (data, not code): hours, shift, grace, geofence."""

    __tablename__ = "schedules"
    __table_args__ = (Index("ix_schedule_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rules: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    grace_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    geofence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AttendanceRecord(Base, TimestampMixin):
    __tablename__ = "attendance_records"
    __table_args__ = (
        Index("ix_attendance_tenant_user", "tenant_id", "user_id"),
        Index("ix_attendance_tenant_time", "tenant_id", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[AttendanceType] = mapped_column(
        Enum(AttendanceType, name="attendance_type"), nullable=False
    )
    status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, name="attendance_status"),
        default=AttendanceStatus.on_time,
        nullable=False,
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    liveness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    device_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("devices.id"), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Device(Base, TimestampMixin):
    """Registered kiosk device (1:N mode), authenticated by device token."""

    __tablename__ = "devices"
    __table_args__ = (Index("ix_device_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[DeviceStatus] = mapped_column(
        Enum(DeviceStatus, name="device_status"), default=DeviceStatus.active, nullable=False
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ApiKey(Base, TimestampMixin):
    """Tenant-scoped API key for server-to-server integration.

    Lets a tenant's own application pull data from netra (e.g. attendance
    reports into their dashboard) without a human login. The full key is shown
    ONCE on creation; only its SHA-256 hash is stored. ``prefix`` is a
    non-secret display fragment (e.g. ``ntr_live_a1b2c3``) so admins can tell
    keys apart. ``scopes`` restrict what the key may do (e.g. attendance:read).
    """

    __tablename__ = "api_keys"
    __table_args__ = (Index("ix_apikey_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    prefix: Mapped[str] = mapped_column(String(20), nullable=False)  # non-secret display fragment
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    scopes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Origins allowed to embed sessions minted by THIS key (frame-ancestors +
    # return_origin check). Scoped per-key, like OAuth client redirect URIs,
    # so it can be set at key-creation time and edited later without touching
    # other keys on the same tenant.
    allowed_origins: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[ApiKeyStatus] = mapped_column(
        Enum(ApiKeyStatus, name="api_key_status"), default=ApiKeyStatus.active, nullable=False
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmbedSession(Base, TimestampMixin):
    """One-time, short-lived session for embedding a netra flow (enrollment) in a
    tenant's own app via iframe/WebView.

    The full token is shown ONCE inside the embed URL; only its hash is stored.
    Bound to one tenant + one subject (external_id) + one purpose. Single-use:
    flipped to ``consumed`` once the enrollment succeeds. See docs embed plan §6.
    """

    __tablename__ = "embed_sessions"
    __table_args__ = (Index("ix_embed_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[EmbedPurpose] = mapped_column(
        Enum(EmbedPurpose, name="embed_purpose"), default=EmbedPurpose.enroll, nullable=False
    )
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_minor: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    return_origin: Mapped[str] = mapped_column(String(1024), nullable=False)
    status: Mapped[EmbedSessionStatus] = mapped_column(
        Enum(EmbedSessionStatus, name="embed_session_status"),
        default=EmbedSessionStatus.pending,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SSOConnection(Base, TimestampMixin):
    """Per-tenant Identity Provider config (Phase 2 wiring)."""

    __tablename__ = "sso_connections"
    __table_args__ = (Index("ix_sso_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    protocol: Mapped[str] = mapped_column(String(50), nullable=False)  # oidc | saml
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_tenant_time", "tenant_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    # null tenant_id = platform-level action
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(), nullable=False
    )


class Consent(Base, TimestampMixin):
    """Explicit biometric consent (UU PDP). Captured before enrollment."""

    __tablename__ = "consents"
    __table_args__ = (Index("ix_consent_tenant_user", "tenant_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    granted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    purpose: Mapped[str] = mapped_column(Text, default="biometric_attendance", nullable=False)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    guardian_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # for minors


class WebhookEndpoint(Base, TimestampMixin):
    """Tenant-registered HTTP subscriber for attendance events (HMAC-signed)."""

    __tablename__ = "webhook_endpoints"
    __table_args__ = (Index("ix_webhook_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    secret: Mapped[str] = mapped_column(String(255), nullable=False)  # HMAC signing key
    events: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # subscribed events
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# Tables that carry tenant_id and must be protected by RLS policies.
TENANT_SCOPED_TABLES: tuple[str, ...] = (
    "users",
    "face_embeddings",
    "schedules",
    "attendance_records",
    "devices",
    "sso_connections",
    "consents",
    "webhook_endpoints",
    "api_keys",
    "embed_sessions",
    # --- Billing ---
    "tenant_subscriptions",
    "usage_snapshots",
    "invoices",
    "invoice_lines",
)


# --------------------------------------------------------------------------- #
# Billing & Subscription (Phase 8.1)
# --------------------------------------------------------------------------- #
class Plan(Base, TimestampMixin):
    """Platform-level plan template (pricing grid is in plan_tiers)."""

    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    edition: Mapped[Edition] = mapped_column(
        Enum(Edition, name="plan_edition"), nullable=False, default=Edition.business
    )
    default_billing_cycle: Mapped[BillingCycle] = mapped_column(
        Enum(BillingCycle, name="billing_cycle"),
        default=BillingCycle.annual,
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(String(10), default="IDR", nullable=False)
    features: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tiers: Mapped[list["PlanTier"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PlanTier.sort_order"
    )


class PlanTier(Base, TimestampMixin):
    """A single band within a plan: min_users → max_users, unit_price, min_charge."""

    __tablename__ = "plan_tiers"
    __table_args__ = (
        UniqueConstraint("plan_id", "min_users", "max_users", name="uq_plan_tier_band"),
        Index("ix_plan_tier_plan", "plan_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    plan_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    min_users: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_users: Mapped[int | None] = mapped_column(Integer, nullable=True)  # NULL = unlimited
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)  # per user per cycle
    min_charge: Mapped[int] = mapped_column(Integer, nullable=False)  # minimum billable
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    plan: Mapped[Plan] = relationship(back_populates="tiers")


class TenantSubscription(Base, TimestampMixin):
    """Per-tenant subscription: which plan, billing cycle, prices, dates, status."""

    __tablename__ = "tenant_subscriptions"
    __table_args__ = (Index("ix_tenant_sub_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    plan_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("plans.id"), nullable=False
    )
    billing_cycle: Mapped[BillingCycle] = mapped_column(
        Enum(BillingCycle, name="billing_cycle"),
        default=BillingCycle.annual,
        nullable=False,
    )
    unit_price_override: Mapped[int | None] = mapped_column(Integer, nullable=True)  # per-user override
    discount_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # 0-100
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"),
        default=SubscriptionStatus.trial,
        nullable=False,
    )

    plan: Mapped[Plan] = relationship()


class UsageSnapshot(Base, TimestampMixin):
    """Daily peak usage metrics per tenant (for billing calculation)."""

    __tablename__ = "usage_snapshots"
    __table_args__ = (
        UniqueConstraint("tenant_id", "snapshot_date", name="uq_usage_tenant_date"),
        Index("ix_usage_tenant_date", "tenant_id", "snapshot_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active_users: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    devices: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    punches: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tenant: Mapped[Tenant] = relationship()


class Invoice(Base, TimestampMixin):
    """Billing invoice: links subscription → usage → line items."""

    __tablename__ = "invoices"
    __table_args__ = (Index("ix_invoice_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenant_subscriptions.id"), nullable=True
    )
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    billed_users: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # peak
    tier_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tax_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tax_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="IDR", nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"),
        default=InvoiceStatus.draft,
        nullable=False,
    )
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    #: When payment falls due. Nullable on purpose — a draft has no deadline
    #: yet, and inventing one would surface drafts as phantom arrears.
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceLine.sort_order"
    )


class InvoiceLine(Base, TimestampMixin):
    """Individual line item on an invoice (base subscription, add-ons, true-up)."""

    __tablename__ = "invoice_lines"
    __table_args__ = (Index("ix_invoice_line_invoice", "invoice_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    invoice_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class InvoiceCounter(Base):
    """Per-month counter backing human-readable invoice numbers.

    One row per ``YYYYMM`` period. The counter is bumped with a single
    ``INSERT ... ON CONFLICT DO UPDATE ... RETURNING`` so two invoices created
    in the same instant cannot be handed the same number. Deriving the next
    number from ``MAX(invoice_number)`` would race under exactly the concurrency
    that matters — a monthly billing run issuing many invoices at once.

    Deliberately NOT tenant-scoped: the sequence is platform-wide, so this table
    stays out of ``TENANT_SCOPED_TABLES`` and carries no RLS policy.
    """

    __tablename__ = "invoice_counters"

    period: Mapped[str] = mapped_column(String(6), primary_key=True)  # YYYYMM
    next_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class DemoRequestStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    closed = "closed"


class DemoRequest(Base, TimestampMixin):
    """Lead captured from the public landing page's demo request form.

    Platform-level (no tenant_id — submitted before any tenant exists) and
    followed up manually by the platform team, not emailed automatically.
    """

    __tablename__ = "demo_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[DemoRequestStatus] = mapped_column(
        Enum(DemoRequestStatus, name="demo_request_status"),
        default=DemoRequestStatus.new,
        nullable=False,
    )
