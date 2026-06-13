"""Structured JSON logging with tenant_id + request_id context (structlog)."""

from __future__ import annotations

import logging
from contextvars import ContextVar

import structlog

# Request-scoped context vars, injected into every log line.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
tenant_id_ctx: ContextVar[str | None] = ContextVar("tenant_id", default=None)


def _inject_context(_: object, __: str, event_dict: dict) -> dict:
    rid = request_id_ctx.get()
    tid = tenant_id_ctx.get()
    if rid is not None:
        event_dict["request_id"] = rid
    if tid is not None:
        event_dict["tenant_id"] = tid
    return event_dict


def configure_logging(*, debug: bool = False) -> None:
    """Configure structlog to emit JSON (prod) or pretty console (dev)."""
    logging.basicConfig(format="%(message)s", level=logging.DEBUG if debug else logging.INFO)

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        _inject_context,
    ]
    if debug:
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if debug else logging.INFO
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
