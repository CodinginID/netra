"""Liveness detection abstraction (anti-spoofing).

Liveness is scored SERVER-SIDE from the captured image — never trusted from the
client — so a replayed photo/video can't pass as a live person. The attendance
flow depends only on the ``LivenessEngine`` protocol; production swaps in the
real passive (Silent-Face) + active (MediaPipe FaceMesh) detectors behind it.
"""

from __future__ import annotations

from app.services.liveness.base import LivenessEngine, LivenessError
from app.services.liveness.factory import get_liveness_engine

__all__ = ["LivenessEngine", "LivenessError", "get_liveness_engine"]
