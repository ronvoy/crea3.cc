import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from sqlmodel import Session

from ..db import engine
from ..models import AccessLog


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Logs each request to the AccessLog table.

    Notes:
    - Designed to be lightweight and safe: failures to log never break requests.
    - The user's email is taken from claims cached on `request.state` by
      `deps.get_current_user` (so we do NOT verify the JWT a second time here).
    """

    def __init__(self, app, *, skip_paths: Optional[set[str]] = None):
        super().__init__(app)
        self.skip_paths = skip_paths or {
            "/docs",
            "/openapi.json",
            "/redoc",
            "/favicon.ico",
            "/health",
        }

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        try:
            path = request.url.path
            if path in self.skip_paths or path.startswith("/static/"):
                return response

            # Avoid logging the log fetch itself too aggressively
            if path.startswith("/api/admin/access-logs"):
                return response

            ip = request.client.host if request.client else ""
            ua = request.headers.get("user-agent", "")

            # Read claims cached by get_current_user (no second verification).
            user_email = None
            claims = getattr(request.state, "token_claims", None)
            if isinstance(claims, dict):
                user_email = claims.get("email") or claims.get("preferred_username")

            with Session(engine) as session:
                session.add(
                    AccessLog(
                        method=request.method,
                        path=path,
                        status_code=getattr(response, "status_code", 0) or 0,
                        ip=ip,
                        user_agent=ua[:500],
                        user_email=user_email,
                        duration_ms=duration_ms,
                    )
                )
                session.commit()
        except Exception:
            # Never break user requests because of logging
            pass

        return response
