"""Real liveness: passive (Silent-Face) + active (MediaPipe FaceMesh).

Heavy deps live in the optional ``recognition`` extra. Loaded lazily so importing
this module never fails when the extra isn't installed. The active MediaPipe
check (blink/head-pose over a short frame burst) is a Phase-2 refinement; this
engine currently scores the passive anti-spoofing model and exposes a hook for
the active stage.
"""

from __future__ import annotations

from app.services.liveness.base import LivenessError


class SilentFaceLivenessEngine:
    name = "silentface"

    def __init__(self) -> None:
        self._model = None

    def _ensure_loaded(self):  # pragma: no cover - needs optional extra + model
        if self._model is not None:
            return self._model
        try:
            import cv2  # noqa: F401  (opencv, provided by the recognition extra)
        except ImportError as exc:
            raise LivenessError(
                "Liveness deps not installed. Run `uv sync --extra recognition` "
                "or set LIVENESS_ENGINE=fake."
            ) from exc
        # Silent-Face MiniFASNet weights are loaded here in production; the
        # concrete model wiring is environment-specific (weights path / device).
        raise LivenessError(
            "SilentFace weights not configured in this environment; "
            "set LIVENESS_ENGINE=fake for now."
        )

    def score(self, image: bytes) -> float:  # pragma: no cover - needs model
        if not image:
            raise LivenessError("empty image")
        self._ensure_loaded()
        raise LivenessError("SilentFace model not loaded")
