"""Shared HTTP mapping for enrollment failures (admin, self-service, embed)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services import recognition_service
from app.services.face import NoFaceDetectedError

DUPLICATE_FACE_DETAIL = "This face is already enrolled for another user"


async def _duplicate_detail(session: AsyncSession, user_id: str, reveal_owner: bool) -> str:
    if not reveal_owner:
        return DUPLICATE_FACE_DETAIL
    name = (
        await session.execute(select(User.full_name).where(User.id == user_id))
    ).scalar_one_or_none()
    return f"{DUPLICATE_FACE_DETAIL}: {name or user_id}"


@asynccontextmanager
async def enrollment_errors(session: AsyncSession, *, reveal_owner: bool) -> AsyncIterator[None]:
    """Translate recognition_service errors into HTTP responses.

    ``reveal_owner`` names the existing owner of a duplicate face — only for
    staff; a self-service or embed caller must never learn who else is enrolled.
    """
    try:
        yield
    except recognition_service.DuplicateFaceError as exc:
        detail = await _duplicate_detail(session, exc.existing_user_id, reveal_owner)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc
    except recognition_service.ConsentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except recognition_service.RecognitionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoFaceDetectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
