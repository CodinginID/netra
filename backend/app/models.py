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
from sqlalchemy.dialects.postgresql import JSONB
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
    super_admin = "super_admin"      # platform level
    tenant_admin = "tenant_admin"    # tenant level
    supervisor = "supervisor"        # tenant level (Supervisor/HR)
    end_user = "end_user"            # tenant level
    kiosk = "kiosk"                  # tenant level (device account)


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
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

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

    tenant: Mapped[Tenant] = relationship(back_populates="users")
    embeddings: Mapped[list[FaceEmbedding]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @validates("external_id")
    def _sync_external_id_hash(self, _key: str, value: str | None) -> str | None:
        """Keep the deterministic hash column in sync with external_id (OPS-5)."""
        self.external_id_hash = external_id_digest(value)
        return value


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
    rules: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    grace_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    geofence: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


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
    location: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    liveness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    device_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("devices.id"), nullable=True
    )


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


class SSOConnection(Base, TimestampMixin):
    """Per-tenant Identity Provider config (Phase 2 wiring)."""

    __tablename__ = "sso_connections"
    __table_args__ = (Index("ix_sso_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    protocol: Mapped[str] = mapped_column(String(50), nullable=False)  # oidc | saml
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_tenant_time", "tenant_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    # null tenant_id = platform-level action
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
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


# Tables that carry tenant_id and must be protected by RLS policies.
TENANT_SCOPED_TABLES: tuple[str, ...] = (
    "users",
    "face_embeddings",
    "schedules",
    "attendance_records",
    "devices",
    "sso_connections",
    "consents",
)
