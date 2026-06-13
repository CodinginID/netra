"""Request middleware: assign request_id and bind logging context vars."""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import request_id_ctx, tenant_id_ctx


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        token_r = request_id_ctx.set(request_id)
        token_t = tenant_id_ctx.set(None)
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token_r)
            tenant_id_ctx.reset(token_t)
        response.headers["x-request-id"] = request_id
        return response
