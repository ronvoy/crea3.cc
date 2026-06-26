import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from sqlmodel import Session

from ..db import engine
from ..models import AccessLog
from ..core.auth_tokens import decode_token


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Logs each request to the AccessLog table.

    Notes:
    - Designed to be lightweight and safe: failures to log should never break requests.
    - If an Authorization: Bearer <Keycloak JWT> is present, we try to extract the user's email claim.
    """

    def __init__(self, app, *, skip_paths: Optional[set[str]] = None):
        super().__init__(app)
        self.skip_paths = skip_paths or {
            "/docs",
            "/openapi.json",
            "/redoc",
            "/favicon.ico",
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

            user_email = None
            auth = request.headers.get("authorization") or request.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()
                try:
                    claims = decode_token(token)
                    user_email = claims.get("email") or claims.get("preferred_username")
                except Exception:
                    # Not one of our tokens (or invalid/expired) -> ignore
                    user_email = None

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
