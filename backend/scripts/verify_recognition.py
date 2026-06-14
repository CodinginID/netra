"""Smoke-test the configured face engine end-to-end (enroll → identify).

Works with whichever engine FACE_ENGINE selects:

    # deterministic, no ML deps:
    FACE_ENGINE=fake uv run python scripts/verify_recognition.py

    # real InsightFace buffalo_s (needs the `recognition` extra + real faces):
    uv sync --extra recognition
    FACE_ENGINE=insightface uv run python scripts/verify_recognition.py \
        --gallery alice.jpg --probe alice2.jpg --probe bob.jpg

With real photos it proves the production path: the gallery image is "enrolled",
each probe is matched 1:N by cosine similarity against it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

# Make the backend package importable when run as a standalone script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.services.face import NoFaceDetectedError, get_face_engine  # noqa: E402


def _cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a), np.asarray(b)
    return float(va @ vb / (np.linalg.norm(va) * np.linalg.norm(vb)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gallery", help="image enrolled into the gallery")
    ap.add_argument("--probe", action="append", default=[], help="image(s) to identify")
    args = ap.parse_args()

    engine = get_face_engine()
    print(
        f"engine={engine.name}  embedding_dim={settings.embedding_dim}  "
        f"match_threshold={settings.match_threshold}"
    )

    if args.gallery:
        gallery_bytes = Path(args.gallery).read_bytes()
        probes = [(p, Path(p).read_bytes()) for p in args.probe]
    else:
        # No real photos given: exercise the loop with the fake engine.
        gallery_bytes = b"face::gallery::alice"
        probes = [("same-as-gallery", gallery_bytes), ("different", b"face::stranger")]

    try:
        gallery_vec = engine.embed(gallery_bytes)
    except NoFaceDetectedError as exc:
        print(f"FAIL: no face in gallery image: {exc}")
        return 1
    print(f"enrolled gallery embedding (dim={len(gallery_vec)})")

    ok = True
    for label, data in probes:
        try:
            vec = engine.embed(data)
        except NoFaceDetectedError as exc:
            print(f"  probe {label}: NO FACE ({exc})")
            ok = False
            continue
        sim = _cosine(gallery_vec, vec)
        verdict = "MATCH" if sim >= settings.match_threshold else "no-match"
        print(f"  probe {label}: similarity={sim:.4f} -> {verdict}")

    print("OK" if ok else "completed with detection failures")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
