"""FastAPI application factory for netra backend."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.middleware import RequestContextMiddleware
from app.api.v1 import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.session import dispose_engine

configure_logging(debug=settings.debug)
log = get_logger("netra")


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    log.info("startup", app=settings.app_name, env=settings.environment, version=__version__)
    yield
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
    async def http_exc_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"data": None, "error": exc.detail}
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
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

    @app.get("/", tags=["root"])
    async def root() -> dict:
        return {"name": settings.app_name, "version": __version__, "docs": "/docs"}

    return app


app = create_app()
