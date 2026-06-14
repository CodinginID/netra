"""Select the configured LivenessEngine (cached singleton)."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.liveness.base import LivenessEngine


@lru_cache
def get_liveness_engine() -> LivenessEngine:
    engine = settings.liveness_engine.lower()
    if engine == "silentface":
        from app.services.liveness.passive import SilentFaceLivenessEngine

        return SilentFaceLivenessEngine()
    if engine == "fake":
        from app.services.liveness.fake import FakeLivenessEngine

        return FakeLivenessEngine()
    raise ValueError(
        f"Unknown LIVENESS_ENGINE '{settings.liveness_engine}' (use 'fake' or 'silentface')"
    )
