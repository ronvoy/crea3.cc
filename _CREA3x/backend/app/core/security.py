from __future__ import annotations

"""Password hashing + one-time codes for the self-contained auth system.

Passwords are hashed with PBKDF2-SHA256 (via passlib), which generates a random
per-password SALT and stores it inside the hash string — so every password is
salted, and identical passwords never share a hash. PBKDF2 is used rather than
bcrypt for portability (no native bcrypt backend needed).
"""

import secrets

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a salted PBKDF2-SHA256 hash string (salt embedded)."""
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(password, hashed)
    except Exception:
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return pwd_context.needs_update(hashed)
    except Exception:
        return False


def generate_code(digits: int = 6) -> str:
    """A numeric, zero-padded one-time code (email verification / password reset)."""
    return str(secrets.randbelow(10 ** digits)).zfill(digits)
