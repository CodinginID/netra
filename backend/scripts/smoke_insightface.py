"""Live smoke test for the real InsightFace engine (no external photo needed).

Loads buffalo_s, runs detection on InsightFace's built-in sample image, then
pushes single-face crops through THIS project's adapter (InsightFaceEngine) to
prove the production path: bytes in -> 512-d normalized embedding out, with
self-similarity ~1.0 and cross-identity similarity low.

Run (needs the optional extra):
    cd backend
    uv run --extra recognition python scripts/smoke_insightface.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("FACE_ENGINE", "insightface")

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from insightface.app import FaceAnalysis  # noqa: E402
from insightface.data import get_image as ins_get_image  # noqa: E402

from app.services.face import NoFaceDetectedError  # noqa: E402
from app.services.face.insightface_engine import InsightFaceEngine  # noqa: E402


def _cos(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a), np.asarray(b)
    return float(va @ vb / (np.linalg.norm(va) * np.linalg.norm(vb)))


def _crop_jpeg(img, bbox, scale_to: int = 480) -> bytes:
    """Crop a face with generous margin and upscale so the detector re-finds it."""
    b = bbox.astype(int)
    fw, fh = b[2] - b[0], b[3] - b[1]
    pad = int(0.6 * max(fw, fh))
    y0, y1 = max(0, b[1] - pad), min(img.shape[0], b[3] + pad)
    x0, x1 = max(0, b[0] - pad), min(img.shape[1], b[2] + pad)
    crop = img[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    s = scale_to / max(h, w)
    if s > 1.0:
        crop = cv2.resize(crop, (int(w * s), int(h * s)))
    ok, buf = cv2.imencode(".jpg", crop)
    if not ok:
        raise RuntimeError("jpeg encode failed")
    return buf.tobytes()


def main() -> int:
    print("loading buffalo_s (downloads model on first run)...", flush=True)
    fa = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
    fa.prepare(ctx_id=-1, det_size=(640, 640))
    img = ins_get_image("t1")  # built-in sample with several faces
    faces = fa.get(img)
    print(f"buffalo_s loaded OK; faces detected in sample: {len(faces)}", flush=True)
    if not faces:
        print("FAIL: no faces detected in sample")
        return 1

    engine = InsightFaceEngine()  # the project's adapter (bytes -> 512-d)
    vecs: list[list[float]] = []
    for i, f in enumerate(faces[:3]):
        try:
            v = engine.embed(_crop_jpeg(img, f.bbox))
        except NoFaceDetectedError as exc:
            print(f"  face{i}: crop not single-face ({exc}) — skipped")
            continue
        vecs.append(v)
        print(f"  adapter embed face{i}: dim={len(v)} norm={np.linalg.norm(v):.3f}", flush=True)

    if not vecs:
        print("FAIL: adapter produced no embeddings")
        return 1

    # Self-similarity: re-embed the first face's crop -> expect ~1.0.
    self_sim = _cos(vecs[0], engine.embed(_crop_jpeg(img, faces[0].bbox)))
    print(f"self similarity (same face): {self_sim:.4f}")
    if len(vecs) >= 2:
        print(f"cross-identity similarity (different faces): {_cos(vecs[0], vecs[1]):.4f}")

    ok = len(vecs[0]) == 512 and self_sim > 0.99
    print("SMOKE OK" if ok else "SMOKE FAILED (unexpected embedding/sim)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
