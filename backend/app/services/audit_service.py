"""Audit logging service — writes immutable trail to audit_logs."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def record(
    session: AsyncSession,
    *,
    action: str,
    actor: str | None,
    tenant_id: str | None,
    detail: dict | None = None,
) -> None:
    session.add(AuditLog(action=action, actor=actor, tenant_id=tenant_id, detail=detail or {}))
    await session.flush()
