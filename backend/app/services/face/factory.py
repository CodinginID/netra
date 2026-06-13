"""Select the configured FaceEngine (cached singleton)."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.face.base import FaceEngine


@lru_cache
def get_face_engine() -> FaceEngine:
    engine = settings.face_engine.lower()
    if engine == "insightface":
        from app.services.face.insightface_engine import InsightFaceEngine

        return InsightFaceEngine()
    if engine == "fake":
        from app.services.face.fake import FakeFaceEngine

        return FakeFaceEngine()
    raise ValueError(f"Unknown FACE_ENGINE '{settings.face_engine}' (use 'fake' or 'insightface')")
