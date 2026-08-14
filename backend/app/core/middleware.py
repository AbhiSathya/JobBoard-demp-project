"""Request-id assignment and access logging.

The id is put in a contextvar before the request runs, so every log line emitted anywhere
downstream — service, matcher, mailer — carries it without anything having to pass it
around. It comes back to the client as `X-Request-ID` and inside error response bodies,
which is what turns "it broke" into a grep.
"""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.logging import request_id_var

logger = logging.getLogger("jobboard.access")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex[:8]
        token = request_id_var.set(request_id)
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration = (time.perf_counter() - started) * 1000
            logger.exception("%s %s -> unhandled error in %.1fms", request.method, request.url.path, duration)
            raise
        finally:
            request_id_var.reset(token)

        duration = (time.perf_counter() - started) * 1000
        log = logger.warning if response.status_code >= 500 else logger.info
        log("%s %s -> %s in %.1fms", request.method, request.url.path, response.status_code, duration)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
