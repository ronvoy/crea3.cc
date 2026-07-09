from __future__ import annotations

"""Tiny file-based store for 6-digit email-verification codes.

Keycloak 24's declarative user-profile rejects unmanaged custom attributes (and a
bare-attributes PUT even wiped the user's email), so we keep the codes on the
backend side instead. Stored in the system temp dir so writing them never trips
uvicorn's --reload file watcher (which watches the source tree).
"""

import json
import os
import tempfile
import threading
import time

_PATH = os.path.join(tempfile.gettempdir(), "crea3x_verify_codes.json")
_lock = threading.Lock()


def _load() -> dict:
    try:
        with open(_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(data: dict) -> None:
    tmp = _PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, _PATH)


def set_code(email: str, code: str, ttl_seconds: int) -> None:
    with _lock:
        data = _load()
        data[email.strip().lower()] = {"code": str(code), "exp": int(time.time()) + int(ttl_seconds)}
        _save(data)


def check_and_consume(email: str, code: str) -> str:
    """Returns 'ok' | 'not_found' | 'expired' | 'mismatch'. Consumes on success."""
    key = email.strip().lower()
    with _lock:
        data = _load()
        rec = data.get(key)
        if not rec:
            return "not_found"
        if int(rec.get("exp", 0)) < int(time.time()):
            data.pop(key, None)
            _save(data)
            return "expired"
        if str(rec.get("code")) != str(code).strip():
            return "mismatch"
        data.pop(key, None)
        _save(data)
        return "ok"
