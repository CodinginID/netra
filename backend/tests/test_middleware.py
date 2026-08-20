"""Tests for RequestContextMiddleware.

The middleware wraps every request, so a fault in it surfaces as a fault in
whatever endpoint happened to be called — which is how the original bug hid:
an endpoint that raised came back as UnboundLocalError from the middleware,
with the real exception nowhere in the traceback.

These build a throwaway Starlette app rather than using the FastAPI app under
test: the behaviour being pinned is the middleware's, and the app's exception
handlers would convert the failure into a response before it could be seen.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app.api.middleware import RequestContextMiddleware
from app.core.logging import request_id_ctx, scope_ctx, tenant_id_ctx


class Boom(Exception):
    """Distinct type so the assertion cannot pass on a coincidence."""


async def _ok(request):  # noqa: ANN001, ARG001
    return PlainTextResponse("ok")


async def _raises(request):  # noqa: ANN001, ARG001
    raise Boom("the real failure")


def _app() -> Starlette:
    app = Starlette(routes=[Route("/ok", _ok), Route("/boom", _raises)])
    app.add_middleware(RequestContextMiddleware)
    return app


@pytest.mark.asyncio
async def test_request_id_is_returned_and_reused():
    """A caller-supplied x-request-id is echoed; otherwise one is generated."""
    transport = ASGITransport(app=_app())
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        generated = await c.get("/ok")
        assert generated.status_code == 200
        assert generated.headers["x-request-id"]

        echoed = await c.get("/ok", headers={"x-request-id": "caller-supplied"})
        assert echoed.headers["x-request-id"] == "caller-supplied"


@pytest.mark.asyncio
async def test_endpoint_exception_reaches_the_caller_unchanged():
    """The original exception propagates, not an error from the middleware.

    The finally block used to read ``response.status_code`` on every path.
    When call_next raised, ``response`` had never been assigned, so the finally
    itself raised UnboundLocalError while the real exception was unwinding —
    and that is what reached the logs and the error tracker instead.
    """
    transport = ASGITransport(app=_app())
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        with pytest.raises(Boom, match="the real failure"):
            await c.get("/boom")


@pytest.mark.asyncio
async def test_context_is_reset_after_a_failed_request():
    """A request that raised leaves no context behind for the next one.

    Context vars outlive the request when they are not reset, so the following
    request's log lines would carry the failed request's id and path.
    """
    transport = ASGITransport(app=_app())
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        with pytest.raises(Boom):
            await c.get("/boom")

    assert request_id_ctx.get() is None
    assert tenant_id_ctx.get() is None
    assert scope_ctx.get() == {}


@pytest.mark.asyncio
async def test_scope_default_is_not_mutated_by_a_request():
    """The module-level default dict stays empty however many requests run.

    It is shared by every caller of ``scope_ctx.get()`` outside a request, so
    writing timing into it would attach one request's numbers to every startup
    and background-job log line for the life of the process.
    """
    transport = ASGITransport(app=_app())
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        await c.get("/ok")
        await c.get("/ok", headers={"x-request-id": "another"})

    assert scope_ctx.get() == {}
