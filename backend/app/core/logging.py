"""Structured JSON logging with tenant_id + request_id context (structlog)."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from contextvars import ContextVar
from types import MappingProxyType

import structlog

# Request-scoped context vars, injected into every log line.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
tenant_id_ctx: ContextVar[str | None] = ContextVar("tenant_id", default=None)
# The middleware sets a fresh dict per request. The default is read-only rather
# than a plain {}: it is shared by every caller, so one request writing timing
# into it would stamp that request's numbers on every startup and background-job
# log line for the life of the process.
scope_ctx: ContextVar[Mapping[str, object]] = ContextVar("scope", default=MappingProxyType({}))


def _inject_context(_: object, __: str, event_dict: dict) -> dict:
    rid = request_id_ctx.get()
    tid = tenant_id_ctx.get()
    if rid is not None:
        event_dict["request_id"] = rid
    if tid is not None:
        event_dict["tenant_id"] = tid
    return event_dict


def _inject_http(_: object, __: str, event_dict: dict) -> dict:
    """Inject HTTP request attributes from middleware scope into every log line.

    In practice that means method and path: status_code and process_time_ms are
    only written once the response exists, which is after the last log line of
    the request has already been emitted. They are here so that adding a
    completion log line in the middleware is all it takes to surface them.
    """
    scope = scope_ctx.get()
    event_dict.setdefault("method", scope.get("method"))
    event_dict.setdefault("path", scope.get("path"))
    event_dict.setdefault("status_code", scope.get("status_code"))
    if scope.get("process_time_ms") is not None:
        event_dict["process_time_ms"] = scope["process_time_ms"]
    return event_dict


def configure_logging(*, debug: bool = False, json_logs: bool = True) -> None:
    """Configure structlog to emit JSON or pretty console output.

    json_logs=True  → always JSON (default; good for prod + log aggregators).
    json_logs=False → pretty ConsoleRenderer in debug, JSON in production.
    """
    logging.basicConfig(format="%(message)s", level=logging.DEBUG if debug else logging.INFO)

    # Suppress watchfiles (uvicorn --reload's file watcher) from leaking
    # "N changes detected" INFO logs into the application log stream.
    logging.getLogger("watchfiles").setLevel(logging.WARNING)

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        _inject_context,
        _inject_http,
    ]
    if json_logs or not debug:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

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
