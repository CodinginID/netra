"""FastAPI application factory for netra backend."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
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
                from app.db.session import SessionFactory
                from app.models import Device, Schedule, User
                from app.services.soft_delete import hard_delete_older_than

                async with SessionFactory() as session:
                    users = await hard_delete_older_than(session, User, days=30)
                    devices = await hard_delete_older_than(session, Device, days=30)
                    schedules = await hard_delete_older_than(session, Schedule, days=30)
                    await session.commit()

                if users or devices or schedules:
                    log.info(
                        "auto_purge_completed",
                        users=users,
                        devices=devices,
                        schedules=schedules,
                    )
            except Exception as exc:
                log.error("auto_purge_failed", error=str(exc))

    purge_task = asyncio.create_task(_purge_loop())

    yield

    purge_task.cancel()
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
        log.warning(
            "request_validation_error",
            method=request.method,
            path=str(request.url.path),
            content_type=request.headers.get("content-type"),
            errors=exc.errors(),
        )
        return JSONResponse(
            status_code=422,
            content={"data": None, "error": "validation_error", "detail": exc.errors()},
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
