from __future__ import annotations

"""Self-contained app authentication tokens (no Keycloak).

The app issues and validates its own HS256 JWTs signed with `settings.jwt_secret`:
  - access token  : short-lived, carries identity + role claims.
  - refresh token : longer-lived, only used to mint new access tokens.

Lifetimes come from the environment (JWT_ACCESS_TOKEN_EXPIRE_MINUTES /
JWT_REFRESH_TOKEN_EXPIRE_DAYS) so the session timeout is configured in .env.
"""

import time
from typing import Any, Dict, Tuple

from jose import JWTError, jwt

from .config import settings

ALGORITHM = "HS256"


def _now() -> int:
    return int(time.time())


def create_access_token(user: Any) -> Tuple[str, int]:
    """Return (token, expires_in_seconds) for the given user row."""
    expires_in = int(settings.access_token_expire_minutes) * 60
    claims = {
        "sub": str(user.id),
        "email": user.email,
        "preferred_username": user.username,
        "username": user.username,
        "role": user.role,
        "email_verified": bool(getattr(user, "email_verified", False)),
        "type": "access",
        "iat": _now(),
        "exp": _now() + expires_in,
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM), expires_in


def create_refresh_token(user: Any) -> str:
    expires_in = int(settings.refresh_token_expire_days) * 86400
    claims = {
        "sub": str(user.id),
        "type": "refresh",
        "iat": _now(),
        "exp": _now() + expires_in,
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """Decode/validate one of our tokens. Raises ValueError when invalid/expired."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
