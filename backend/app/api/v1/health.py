"""Health & readiness router."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import SessionFactory

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """Liveness + DB readiness probe for reverse proxy / uptime monitor."""
    db_ok = False
    try:
        async with SessionFactory() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "checks": {"database": "up" if db_ok else "down"},
    }
