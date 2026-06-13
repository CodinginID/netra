"""FaceEngine protocol + errors shared by all engine implementations."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


class FaceError(Exception):
    """Base error for face processing failures."""


class NoFaceDetectedError(FaceError):
    """Raised when no (or more than one) usable face is found in the image."""


@runtime_checkable
class FaceEngine(Protocol):
    """Turns an image into a normalized embedding vector.

    Implementations MUST return an L2-normalized vector of length
    ``settings.embedding_dim`` so cosine similarity (pgvector ``<=>``) is
    meaningful. Raise ``NoFaceDetectedError`` when no single face is present.
    """

    name: str

    def embed(self, image: bytes) -> list[float]:
        """Detect the primary face in ``image`` and return its embedding."""
        ...
