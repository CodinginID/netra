"""Real InsightFace ``buffalo_s`` engine (ArcFace 512-d) via ONNX Runtime (CPU).

Heavy ML deps (insightface, onnxruntime, opencv, numpy) are NOT in the base
install — they live in the optional ``recognition`` extra:

    uv sync --extra recognition

The model is loaded lazily on first use so importing this module is cheap and
never fails just because the extra isn't installed.
"""

from __future__ import annotations

import io

import numpy as np

from app.core.config import settings
from app.services.face.base import FaceError, NoFaceDetectedError


class InsightFaceEngine:
    name = "insightface"

    def __init__(self) -> None:
        self._app = None  # lazily initialized FaceAnalysis

    def _ensure_loaded(self):
        if self._app is not None:
            return self._app
        try:
            from insightface.app import FaceAnalysis
        except ImportError as exc:  # pragma: no cover - depends on optional extra
            raise FaceError(
                "InsightFace not installed. Run `uv sync --extra recognition` "
                "or set FACE_ENGINE=fake."
            ) from exc
        root_kwargs = {}
        if settings.insightface_model_root:
            root_kwargs["root"] = settings.insightface_model_root
        app = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"], **root_kwargs)
        app.prepare(ctx_id=-1, det_size=(640, 640))
        self._app = app
        return app

    def embed(self, image: bytes) -> list[float]:  # pragma: no cover - needs model+image
        if not image:
            raise NoFaceDetectedError("empty image")
        try:
            from PIL import Image
        except ImportError as exc:
            raise FaceError("Pillow not installed (recognition extra).") from exc

        app = self._ensure_loaded()
        rgb = Image.open(io.BytesIO(image)).convert("RGB")
        bgr = np.array(rgb)[:, :, ::-1]  # InsightFace expects BGR
        faces = app.get(bgr)
        if len(faces) != 1:
            raise NoFaceDetectedError(f"expected exactly 1 face, found {len(faces)}")
        emb = np.asarray(faces[0].normed_embedding, dtype=float)
        if emb.shape[0] != settings.embedding_dim:
            raise FaceError(f"embedding dim {emb.shape[0]} != configured {settings.embedding_dim}")
        return emb.tolist()
