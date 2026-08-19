"""Request middleware: assign request_id, HTTP context, and timing."""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import request_id_ctx, scope_ctx, tenant_id_ctx, timing_ctx


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        token_r = request_id_ctx.set(request_id)
        token_t = tenant_id_ctx.set(None)

        # Capture HTTP request context for every log line in this request.
        token_scope = scope_ctx.set({"method": request.method, "path": request.url.path})

        # Start timing — process_time_ms is reported in the post-response log.
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            process_time_ms = (time.perf_counter() - start) * 1000
            scope_ctx.get().update(
                {"status_code": response.status_code, "process_time_ms": round(process_time_ms, 2)}
            )
            timing_ctx.get().update({"process_time_ms": process_time_ms})
            request_id_ctx.reset(token_r)
            tenant_id_ctx.reset(token_t)
        response.headers["x-request-id"] = request_id
        return response
