"""LivenessEngine protocol + error."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


class LivenessError(Exception):
    """Base error for liveness scoring failures."""


@runtime_checkable
class LivenessEngine(Protocol):
    """Scores how likely the captured image is a live person (0.0–1.0)."""

    name: str

    def score(self, image: bytes) -> float:
        """Return a liveness probability in [0, 1] for ``image``."""
        ...
