"""FastAPI application factory for netra backend."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.middleware import RequestContextMiddleware
from app.api.v1 import api_router
from app.api import ws
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.session import dispose_engine

configure_logging(debug=settings.debug, json_logs=settings.log_json)
log = get_logger("netra")


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    log.info("startup", app=settings.app_name, env=settings.environment, version=__version__)

    async def _purge_loop() -> None:
        """Background loop: hard-delete soft-deleted entities older than 30 days, every 24h."""
        while True:
            await asyncio.sleep(24 * 3600)  # 24 hours
            try:
                from app.services.soft_delete import purge_expired

                counts = await purge_expired(days=30)

                # Log every run, including empty ones: a purge that silently
                # stopped deleting is indistinguishable from "nothing expired"
                # unless the zero is on the record.
                log.info("auto_purge_completed", **counts)
            except Exception as exc:
                log.error("auto_purge_failed", error=str(exc))

    async def _usage_snapshot_loop() -> None:
        """Background loop: record daily per-tenant usage snapshots at 00:30 UTC.

        Anchored to a wall-clock time rather than "24h after startup" like the
        purge loop above. A run time that drifts with every restart would make
        consecutive days cover unequal spans, and the whole point of these rows
        is comparing one day against another.

        Safe to run on more than one replica: record_usage_snapshot upserts on
        (tenant_id, snapshot_date).
        """
        while True:
            now = datetime.now(timezone.utc)
            target = now.replace(hour=0, minute=30, second=0, microsecond=0)
            if target <= now:
                target += timedelta(days=1)
            await asyncio.sleep((target - now).total_seconds())
            try:
                from app.services.usage_snapshot import record_all

                counts = await record_all()

                # Log every run, including the empty ones: a job that quietly
                # stopped recording is indistinguishable from "no tenants were
                # due" unless the zero is on the record.
                log.info("usage_snapshot_completed", **counts)
            except Exception as exc:
                log.error("usage_snapshot_failed", error=str(exc))

    purge_task = asyncio.create_task(_purge_loop())
    # Disabled in tests and CI, where a background task would open connections
    # against a database the suite is busy truncating.
    snapshot_task = (
        asyncio.create_task(_usage_snapshot_loop()) if settings.enable_scheduler else None
    )

    yield

    purge_task.cancel()
    if snapshot_task is not None:
        snapshot_task.cancel()
    await dispose_engine()
    log.info("shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="netra API",
        version=__version__,
        description="SaaS multi-tenant face-recognition attendance platform.",
        lifespan=lifespan,
    )

    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Standardized error envelope ---
    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 422:
            log.warning(
                "http_422_error",
                method=request.method,
                path=str(request.url.path),
                detail=exc.detail,
            )
        return JSONResponse(
            status_code=exc.status_code, content={"data": None, "error": exc.detail}
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # pydantic leaves the raw exception object in errors()[i]["ctx"]["error"]
        # for custom (e.g. model_validator ValueError) checks — not JSON-serializable
        # on its own, so stringify it before it hits either the logger or the response.
        def _stringify_ctx_error(e: dict) -> dict:
            if not e.get("ctx", {}).get("error"):
                return e
            return {**e, "ctx": {**e["ctx"], "error": str(e["ctx"]["error"])}}

        errors = [_stringify_ctx_error(e) for e in exc.errors()]
        log.warning(
            "request_validation_error",
            method=request.method,
            path=str(request.url.path),
            content_type=request.headers.get("content-type"),
            errors=errors,
        )
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder({"data": None, "error": "validation_error", "detail": errors}),
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", error=str(exc), error_type=type(exc).__name__)
        return JSONResponse(
            status_code=500, content={"data": None, "error": "internal_server_error"}
        )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    app.include_router(ws.router)

    @app.get("/", tags=["root"])
    async def root() -> dict:
        return {"name": settings.app_name, "version": __version__, "docs": "/docs"}

    return app


app = create_app()
