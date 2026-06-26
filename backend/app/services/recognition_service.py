"""Enrollment & 1:N identification — the core of face-recognition attendance.

Tenant isolation is enforced by RLS on ``face_embeddings`` (the caller's session
is already tenant-bound), so a similarity search can never match another
tenant's faces even though the query carries no explicit tenant filter.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models import Consent, FaceEmbedding, User
from app.services.face import FaceEngine, get_face_engine

log = get_logger("netra.recognition")


class RecognitionError(Exception):
    pass


class ConsentRequiredError(RecognitionError):
    """Enrollment attempted before the subject granted biometric consent (UU PDP)."""


@dataclass
class Match:
    user_id: str
    similarity: float


async def _has_consent(session: AsyncSession, user_id: str) -> bool:
    row = await session.execute(
        select(Consent.id).where(Consent.user_id == user_id, Consent.granted.is_(True)).limit(1)
    )
    return row.scalar_one_or_none() is not None


async def enroll(
    session: AsyncSession,
    tenant_id: str,
    user_id: str,
    image: bytes,
    *,
    engine: FaceEngine | None = None,
) -> FaceEmbedding:
    """Compute and store a face embedding for ``user_id``. Requires consent."""
    if not await _has_consent(session, user_id):
        raise ConsentRequiredError("biometric consent not granted for this user")

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise RecognitionError("user not found")

    vector = (engine or get_face_engine()).embed(image)
    embedding = FaceEmbedding(tenant_id=tenant_id, user_id=user_id, vector=vector, version=1)
    session.add(embedding)
    user.enrolled = True
    await session.flush()
    log.info("enroll_stored", user_id=user_id, tenant_id=tenant_id, dim=len(vector))
    return embedding


async def enroll_multi(
    session: AsyncSession,
    tenant_id: str,
    user_id: str,
    images: list[bytes],
    *,
    engine: FaceEngine | None = None,
) -> list[FaceEmbedding]:
    """Enroll 1–N face images, replacing all previous embeddings for the user.

    Requires consent. Typical use: active enrollment with front, left, right angles.
    """
    if not images:
        raise RecognitionError("at least one image is required")
    if not await _has_consent(session, user_id):
        raise ConsentRequiredError("biometric consent not granted for this user")

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise RecognitionError("user not found")

    # Replace all previous embeddings for this user (re-enroll = fresh start)
    await session.execute(delete(FaceEmbedding).where(FaceEmbedding.user_id == user_id))

    eng = engine or get_face_engine()
    embeddings: list[FaceEmbedding] = []
    for img in images:
        vector = eng.embed(img)
        emb = FaceEmbedding(tenant_id=tenant_id, user_id=user_id, vector=vector, version=1)
        session.add(emb)
        embeddings.append(emb)

    user.enrolled = True
    await session.flush()
    return embeddings


async def identify(
    session: AsyncSession,
    image: bytes,
    *,
    threshold: float | None = None,
    engine: FaceEngine | None = None,
) -> Match | None:
    """1:N search: return the best match above ``threshold`` cosine similarity."""
    query_vec = (engine or get_face_engine()).embed(image)
    min_sim = settings.match_threshold if threshold is None else threshold

    distance = FaceEmbedding.vector.cosine_distance(query_vec).label("distance")
    row = (
        await session.execute(select(FaceEmbedding.user_id, distance).order_by(distance).limit(1))
    ).first()
    if row is None:
        # No enrolled faces visible to this (tenant-scoped) session at all.
        log.info("identify_no_candidates", threshold=min_sim)
        return None

    user_id, dist = row
    similarity = 1.0 - float(dist)
    accepted = similarity >= min_sim
    # Log the best candidate + its similarity even on rejection — essential for
    # tuning the threshold and diagnosing "face not recognized".
    log.info(
        "identify_result",
        best_user_id=user_id,
        similarity=round(similarity, 4),
        threshold=min_sim,
        accepted=accepted,
    )
    if not accepted:
        return None
    return Match(user_id=user_id, similarity=similarity)
