"""Request middleware: assign request_id, HTTP context, and timing."""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import request_id_ctx, scope_ctx, tenant_id_ctx


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        token_r = request_id_ctx.set(request_id)
        token_t = tenant_id_ctx.set(None)

        # Capture HTTP request context for every log line in this request. The
        # dict is kept as a local: the context default is read-only, so writing
        # through scope_ctx.get() is only valid on a request that got this far.
        scope: dict[str, object] = {"method": request.method, "path": request.url.path}
        token_s = scope_ctx.set(scope)

        # Start timing. Note that nothing emits a log line after the block
        # below, so the status and duration written into the scope are only
        # visible to a caller that adds one — see the note in core/logging.
        start = time.perf_counter()
        status_code: int | None = None
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            # `response` is deliberately not read here. When call_next raises —
            # a client disconnecting mid-request, or any unhandled error — it
            # was never assigned, so reading it raised UnboundLocalError from
            # inside the finally and that replaced the real exception on its
            # way out. status_code simply stays None when there is no response
            # to ask, and the duration is still recorded either way: a request
            # that blew up is the one whose timing is worth having.
            scope["process_time_ms"] = round((time.perf_counter() - start) * 1000, 2)
            if status_code is not None:
                scope["status_code"] = status_code
            scope_ctx.reset(token_s)
            request_id_ctx.reset(token_r)
            tenant_id_ctx.reset(token_t)
        response.headers["x-request-id"] = request_id
        return response
