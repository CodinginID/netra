"""Typed helpers for SQLAlchemy execution results."""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy import CursorResult, Result


def rowcount(result: Result[Any]) -> int:
    """Rows matched by an UPDATE/DELETE (``session.execute`` is typed as Result)."""
    return cast(CursorResult[Any], result).rowcount or 0
