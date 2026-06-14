"""Deterministic liveness engine for dev & tests (no ML).

Returns a high "live" score for normal image bytes, and a low score when the
payload carries the marker ``b"SPOOF"`` — so anti-spoofing rejection is
testable without real attack samples.
"""

from __future__ import annotations

from app.services.liveness.base import LivenessError

SPOOF_MARKER = b"SPOOF"


class FakeLivenessEngine:
    name = "fake"

    def score(self, image: bytes) -> float:
        if not image:
            raise LivenessError("empty image")
        if SPOOF_MARKER in image:
            return 0.10
        return 0.99
