"""Passive liveness: MiniFASNetV2 (SilentFace) via ONNX Runtime.

Model: 2.7_80x80_MiniFASNetV2 — 3-class: [live, print-attack, replay-attack].
Liveness score = softmax[0] (live probability).

The ONNX weights are auto-downloaded from HuggingFace on first use and cached
at the path configured by SILENTFACE_MODEL_PATH.  Run
``python scripts/prepare_silentface.py`` to pre-download explicitly.
"""

from __future__ import annotations

import hashlib
import urllib.request
from pathlib import Path

import numpy as np

from app.core.logging import get_logger
from app.services.liveness.base import LivenessError

log = get_logger("netra.liveness.passive")

# HuggingFace: garciafido/minifasnet-v2-anti-spoofing-onnx
_MODEL_URL = (
    "https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx"
    "/resolve/main/minifasnet_v2.onnx"
)
_MODEL_SHA256 = "d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b"

_INPUT_SIZE = (80, 80)   # (width, height)
_SCALE = 2.7             # face crop margin multiplier
_LIVE_CLASS = 2          # softmax index for the "real/live" class (this model)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def _download_model(dest: Path) -> None:
    """Download the ONNX model from HuggingFace and verify SHA-256."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(_MODEL_URL, headers={"User-Agent": "netra/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except OSError as exc:
        raise LivenessError(
            f"Failed to download SilentFace model from HuggingFace: {exc}\n"
            f"Run: python scripts/prepare_silentface.py"
        ) from exc

    digest = hashlib.sha256(data).hexdigest()
    if digest != _MODEL_SHA256:
        raise LivenessError(
            f"SilentFace model SHA-256 mismatch (got {digest[:16]}…). "
            "The download may be corrupt. Delete and retry."
        )
    dest.write_bytes(data)


class SilentFaceLivenessEngine:
    name = "silentface"

    def __init__(self) -> None:
        self._session = None
        self._cascade = None

    def _ensure_loaded(self):
        if self._session is not None:
            return self._session

        try:
            import onnxruntime as ort
        except ImportError as exc:
            raise LivenessError(
                "onnxruntime not installed. Run: uv sync --extra recognition"
            ) from exc

        from app.core.config import settings

        model_path = Path(settings.silentface_model_path)
        if not model_path.is_file():
            _download_model(model_path)

        self._session = ort.InferenceSession(
            str(model_path), providers=["CPUExecutionProvider"]
        )
        return self._session

    def _get_cascade(self):
        if self._cascade is not None:
            return self._cascade
        import cv2

        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self._cascade = cv2.CascadeClassifier(path)
        return self._cascade

    def _decode_bgr(self, image: bytes) -> np.ndarray:
        import cv2

        buf = np.frombuffer(image, dtype=np.uint8)
        bgr = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if bgr is None:
            raise LivenessError("Failed to decode image (unsupported format or corrupt)")
        return bgr

    def _crop_face(self, bgr: np.ndarray) -> np.ndarray:
        """Crop the largest detected face with a 2.7× scale margin."""
        import cv2

        h, w = bgr.shape[:2]
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        faces = self._get_cascade().detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=3, minSize=(20, 20)
        )
        if len(faces) == 0:
            # Fallback: center square crop instead of full frame.
            # MiniFASNetV2 was trained on face crops — a full-frame resize to 80×80
            # produces near-zero scores. Center crop is a much better approximation.
            side = min(h, w)
            cy, cx = h // 2, w // 2
            half = side // 2
            return bgr[max(0, cy - half):cy + half, max(0, cx - half):cx + half]

        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        cx, cy = fx + fw // 2, fy + fh // 2
        half = int(max(fw, fh) * _SCALE / 2)
        x1, y1 = max(0, cx - half), max(0, cy - half)
        x2, y2 = min(w, cx + half), min(h, cy + half)
        return bgr[y1:y2, x1:x2]

    def _preprocess(self, bgr: np.ndarray) -> np.ndarray:
        """Resize → [0,1] float → NCHW (keep BGR as the model expects)."""
        import cv2

        crop = self._crop_face(bgr)
        resized = cv2.resize(crop, _INPUT_SIZE)               # 80×80 BGR
        norm = resized.astype(np.float32) / 255.0             # [0, 1], no ImageNet normalisation
        chw = np.transpose(norm, (2, 0, 1))                   # HWC → CHW
        return np.expand_dims(chw, axis=0)                    # (1, 3, 80, 80)

    def score(self, image: bytes) -> float:
        """Return liveness probability in [0, 1]. 1.0 = definitely live."""
        if not image:
            raise LivenessError("empty image")

        session = self._ensure_loaded()
        bgr = self._decode_bgr(image)
        blob = self._preprocess(bgr)

        input_name = session.get_inputs()[0].name
        logits = session.run(None, {input_name: blob})[0][0]  # (3,)
        probs = _softmax(logits)
        # For THIS ONNX model (garciafido/minifasnet-v2), empirically the "live"
        # class is index 2: a real face in front of the camera yields
        # probs ≈ [~0.0004, ~0.006, ~0.993] (verified via logged diagnostics).
        # Index 0/1 are the spoof classes (print / replay).
        live = float(probs[_LIVE_CLASS])
        log.info(
            "liveness_probs",
            prob0=round(float(probs[0]), 4),
            prob1=round(float(probs[1]), 4),
            prob2=round(float(probs[2]), 4),
            live=round(live, 4),
        )
        return live
