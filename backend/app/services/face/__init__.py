"""Face-recognition engine abstraction.

The attendance domain (enroll / identify) depends only on the ``FaceEngine``
protocol, never on a concrete ML library. This keeps the core logic fully
testable with a deterministic fake engine, while production swaps in the real
InsightFace ``buffalo_s`` model behind the same interface.
"""

from __future__ import annotations

from app.services.face.base import FaceEngine, FaceError, NoFaceDetectedError
from app.services.face.factory import get_face_engine

__all__ = ["FaceEngine", "FaceError", "NoFaceDetectedError", "get_face_engine"]
