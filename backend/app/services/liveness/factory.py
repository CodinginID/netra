"""Select the configured LivenessEngine (cached singleton).

If the requested engine cannot be loaded (missing deps or model), falls back
to FakeLivenessEngine with a logged warning — so dev environments without
ML deps still work for attendance flow testing.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.core.logging import get_logger
from app.services.liveness.base import LivenessEngine

log = get_logger("netra.liveness")


@lru_cache
def get_liveness_engine() -> LivenessEngine:
    engine = settings.liveness_engine.lower()
    if engine == "silentface":
        try:
            # Check that onnxruntime is importable BEFORE trying SilentFace.
            import onnxruntime as _ort  # noqa: F841
        except ImportError as exc:
            log.warning(
                "silentface_unavailable_fallback",
                reason=f"onnxruntime not installed: {exc}",
                fallback="fake",
            )
            from app.services.liveness.fake import FakeLivenessEngine

            return FakeLivenessEngine()

        try:
            from app.services.liveness.passive import SilentFaceLivenessEngine

            # Proactively validate that the model is accessible before returning.
            from pathlib import Path

            from app.core.config import settings as _settings

            model_path = Path(_settings.silentface_model_path)
            if not model_path.is_file():
                raise FileNotFoundError(f"Model not found at {model_path}")

            return SilentFaceLivenessEngine()
        except (FileNotFoundError, OSError) as exc:
            log.warning(
                "silentface_unavailable_fallback",
                reason=str(exc),
                fallback="fake",
            )
            from app.services.liveness.fake import FakeLivenessEngine

            return FakeLivenessEngine()
    if engine == "fake":
        from app.services.liveness.fake import FakeLivenessEngine

        return FakeLivenessEngine()
    raise ValueError(
        f"Unknown LIVENESS_ENGINE '{settings.liveness_engine}' (use 'fake' or 'silentface')"
    )
