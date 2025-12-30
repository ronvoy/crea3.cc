from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

# Use PBKDF2 for maximum compatibility on Windows (avoids bcrypt backend issues)
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

JWT_ALG = "HS256"
JWT_EXPIRE_MINUTES_DEFAULT = 60 * 24 * 7  # 7 days


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_token(
    payload: Optional[Dict[str, Any]] = None,
    *,
    subject: Optional[str] = None,
    secret: Optional[str] = None,
    expires_minutes: int = JWT_EXPIRE_MINUTES_DEFAULT,
    expires_delta: Optional[timedelta] = None,
    algorithm: str = JWT_ALG,
    **extra: Any,
) -> str:
    """Create a JWT token (robust + backward compatible).

    Supported call styles:
      - create_token({"sub": "email"}, expires_minutes=..., secret=...)
      - create_token(subject="email", secret=..., expires_minutes=...)
      - create_token(subject="email", secret=..., expires_delta=timedelta(...))
    """
    if payload is None:
        payload = {}

    # Map older styles
    if subject is not None and "sub" not in payload:
        payload["sub"] = subject

    # Compute expiration
    if expires_delta is not None:
        exp = datetime.utcnow() + expires_delta
    else:
        exp = datetime.utcnow() + timedelta(minutes=int(expires_minutes))

    claims: Dict[str, Any] = dict(payload)
    claims["exp"] = int(exp.timestamp())  # numeric date; safest for jose/json

    # Only include JSON-serializable extras as claims.
    for k, v in extra.items():
        if k in ("expires_delta", "expires_minutes"):
            continue
        if isinstance(v, timedelta):
            # never embed timedelta in JWT
            continue
        if k not in claims:
            claims[k] = v

    if not secret:
        # Dev fallback; production must override via settings.jwt_secret
        secret = "dev-secret-change-me"

    return jwt.encode(claims, secret, algorithm=algorithm)


def decode_token(token: str, secret: Optional[str] = None, algorithm: str = JWT_ALG) -> Dict[str, Any]:
    """Decode and validate JWT token.

    Compatibility:
      - decode_token(token)
      - decode_token(token, settings.jwt_secret)
    """
    if not secret:
        secret = "dev-secret-change-me"
    try:
        return jwt.decode(token, secret, algorithms=[algorithm])
    except JWTError as e:
        raise ValueError("Invalid token") from e
