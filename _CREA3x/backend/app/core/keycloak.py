from __future__ import annotations

import time
from typing import Any, Dict, Optional, Tuple

import httpx
from jose import jwt

from .config import settings

# Small in-process JWKS cache (sufficient for local dev).
_JWKS_CACHE: Optional[Tuple[float, Dict[str, Any]]] = None
_JWKS_TTL_SECONDS = 60 * 10  # 10 minutes


def _jwks_url() -> str:
    return (
        f"{settings.keycloak_api_base}/realms/{settings.keycloak_realm}"
        "/protocol/openid-connect/certs"
    )


def _fetch_jwks() -> Dict[str, Any]:
    url = _jwks_url()
    with httpx.Client(timeout=10.0) as client:
        r = client.get(url)
        r.raise_for_status()
        return r.json()


def get_jwks() -> Dict[str, Any]:
    """Return Keycloak JWKS with a small TTL cache."""
    global _JWKS_CACHE
    now = time.time()
    if _JWKS_CACHE is not None:
        ts, jwks = _JWKS_CACHE
        if now - ts < _JWKS_TTL_SECONDS:
            return jwks
    jwks = _fetch_jwks()
    _JWKS_CACHE = (now, jwks)
    return jwks


def _select_jwk(token: str) -> Dict[str, Any]:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    jwks = get_jwks()
    keys = jwks.get("keys", [])

    if kid:
        for k in keys:
            if k.get("kid") == kid:
                return k

    # Fallback: return the first key if kid is missing.
    if keys:
        return keys[0]

    raise ValueError("No JWKS keys available from Keycloak")


def verify_access_token(token: str) -> Dict[str, Any]:
    """Verify a Keycloak access token and return its claims."""
    realm = settings.keycloak_realm

    # Try with cached JWKS; if the kid is missing (rotation), refresh once.
    try:
        key = _select_jwk(token)
    except Exception:
        # Force refresh
        global _JWKS_CACHE
        _JWKS_CACHE = None
        key = _select_jwk(token)

    # Verify signature + expiry against OUR Keycloak's JWKS. The issuer is checked
    # host-agnostically below: because Keycloak is proxied under the app origin
    # (single-port), the token's `iss` reflects whatever domain the browser used
    # (localhost:8000 or a tunnel domain), so we only require it to be OUR realm.
    claims = jwt.decode(
        token,
        key,
        algorithms=["RS256", "ES256"],
        options={
            "verify_aud": False,
            "verify_signature": True,
            "verify_exp": True,
            "verify_iss": False,
        },
    )

    iss = str(claims.get("iss", "")).rstrip("/")
    if not iss.endswith(f"/realms/{realm}"):
        raise ValueError(f"Invalid issuer: {iss!r}")

    # Explicit client check (Keycloak uses `azp` for the authorized party).
    client_id = settings.keycloak_client_id
    azp = claims.get("azp")
    aud = claims.get("aud")
    aud_ok = False

    if isinstance(aud, str):
        aud_ok = aud == client_id
    elif isinstance(aud, list):
        aud_ok = client_id in aud

    if not (azp == client_id or aud_ok):
        raise ValueError("Token is not intended for this client")

    return claims
