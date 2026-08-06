"""Lightweight in-process rate limiting for sensitive endpoints (e.g. login).

Sliding-window counter keyed by client IP. No external dependency so it
hot-reloads without a rebuild. NOTE: state is per-process — for a multi-replica
deployment, move this to a shared store (Redis). Good enough to blunt
brute-force on a single instance.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class SlidingWindowLimiter:
    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        dq = self._hits[key]
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if len(dq) >= self.max_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please wait a moment and try again.",
                headers={"Retry-After": str(self.window_seconds)},
            )
        dq.append(now)
        # Opportunistic cleanup so idle keys don't accumulate forever.
        if not dq:
            self._hits.pop(key, None)

    def reset(self) -> None:
        """Drop all recorded attempts. For tests, which share one process."""
        self._hits.clear()


def _client_ip(request: Request) -> str:
    # Honor the first hop in X-Forwarded-For when behind a reverse proxy.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# 10 attempts per minute per IP on auth endpoints.
_login_limiter = SlidingWindowLimiter(max_attempts=10, window_seconds=60)


async def login_rate_limit(request: Request) -> None:
    """FastAPI dependency: throttle auth attempts per client IP."""
    _login_limiter.check(f"auth:{_client_ip(request)}")


def reset_login_limiter() -> None:
    """Clear login throttle state. Used by the test suite between tests."""
    _login_limiter.reset()
