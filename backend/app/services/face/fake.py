"""Deterministic, dependency-free face engine for dev & tests.

Maps image bytes to a stable L2-normalized vector. The SAME bytes always yield
the SAME embedding (so a re-presented face matches), while different bytes yield
near-orthogonal vectors (so different faces don't). No ML, no model downloads.
"""

from __future__ import annotations

import hashlib

import numpy as np

from app.core.config import settings
from app.services.face.base import NoFaceDetectedError


class FakeFaceEngine:
    name = "fake"

    def __init__(self, dim: int | None = None) -> None:
        self._dim = dim or settings.embedding_dim

    def embed(self, image: bytes) -> list[float]:
        if not image:
            raise NoFaceDetectedError("empty image")
        # Seed an RNG from the image digest -> deterministic per distinct image.
        seed = int.from_bytes(hashlib.sha256(image).digest()[:8], "big")
        rng = np.random.default_rng(seed)
        vec = rng.standard_normal(self._dim)
        norm = np.linalg.norm(vec)
        if norm == 0:  # astronomically unlikely; guard anyway
            raise NoFaceDetectedError("degenerate embedding")
        return (vec / norm).astype(float).tolist()
