from __future__ import annotations

"""Shared UI presets (theme + animation).

Read is PUBLIC so that visitors who are not signed in can apply a preset the
team published; creating or replacing one requires a signed-in user, and only
the publisher may delete their own preset.
"""

import base64
import hashlib
import logging
import re
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..models import UiPreset, User, utcnow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/presets", tags=["ui-presets"])

MAX_PAYLOAD_CHARS = 400_000     # the payload holds a URL, never the image bytes

# Shared background images live on the server so EVERY visitor (including
# anonymous / incognito) can load a published preset's picture.
MEDIA_DIR = Path("ui_media")
MEDIA_DIR.mkdir(exist_ok=True)
MAX_IMAGE_BYTES = 4 * 1024 * 1024


def _maybe_user(request: Request, session: Session) -> User | None:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    try:
        from ..core.auth_tokens import decode_token
        claims = decode_token(auth.split(" ", 1)[1].strip())
        return session.get(User, int(claims.get("sub")))
    except Exception:
        return None


class PresetIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    payload: Dict[str, Any] = Field(default_factory=dict)


def _out(p: UiPreset) -> dict:
    return {
        "name": p.name,
        "payload": p.payload or {},
        "author": p.created_by_name or "",
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


GLOBAL_KEY = "ui.global_theme"          # {"name": str|None}
CUSTOM_KEY = "ui.customization_enabled"  # {"enabled": bool}


def read_global_look(session: Session) -> Dict[str, Any]:
    """The platform-wide look every visitor starts from, plus the master switch.

    customization_enabled: admin override if set, else UI_CUSTOMIZATION from .env.
    global_preset / payload: the preset the admin marked as global (None = none).
    """
    from ..models import AppSetting
    from ..core.config import settings as _settings
    cust = session.get(AppSetting, CUSTOM_KEY)
    enabled = bool(cust.value.get("enabled")) if cust and "enabled" in (cust.value or {}) else bool(_settings.ui_customization)
    glob = session.get(AppSetting, GLOBAL_KEY)
    name = (glob.value or {}).get("name") if glob else None
    payload = None
    updated = None
    if name:
        row = session.exec(select(UiPreset).where(UiPreset.name == name)).first()
        if row:
            payload = row.payload
            updated = (glob.updated_at.isoformat() if glob and glob.updated_at else None)
        else:
            name = None
    return {
        "customization_enabled": enabled,
        "customization_source": "admin" if (cust and "enabled" in (cust.value or {})) else "env",
        "global_preset": name,
        "payload": payload,
        "global_set_at": updated,
    }


@router.get("/global")
def global_look(session: Session = Depends(get_session)):
    """Public: the admin-chosen global theme and whether visitors may customise."""
    return read_global_look(session)


@router.get("")
def list_presets(session: Session = Depends(get_session)):
    """Every shared preset — available to anonymous visitors too."""
    rows = session.exec(select(UiPreset).order_by(UiPreset.name)).all()
    return [_out(p) for p in rows]


@router.post("")
def upsert_preset(
    body: PresetIn,
    request: Request,
    session: Session = Depends(get_session),
):
    """Publish (or update) a shared preset. Requires a signed-in user."""
    user = _maybe_user(request, session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to publish a preset.")

    import json
    if len(json.dumps(body.payload)) > MAX_PAYLOAD_CHARS:
        raise HTTPException(
            status_code=413,
            detail="This preset is too large to share (remove the background image before publishing).",
        )

    name = body.name.strip()[:40]
    existing = session.exec(select(UiPreset).where(UiPreset.name == name)).first()
    if existing:
        if existing.created_by_id not in (None, user.id):
            raise HTTPException(status_code=403, detail="This preset belongs to another user.")
        existing.payload = body.payload
        existing.updated_at = utcnow()
        session.add(existing)
        session.commit()
        return {"ok": True, "name": name, "updated": True}

    row = UiPreset(
        name=name, payload=body.payload,
        created_by_id=user.id, created_by_name=user.username or "",
    )
    session.add(row)
    session.commit()
    return {"ok": True, "name": name, "updated": False}


@router.delete("/{name}")
def delete_preset(name: str, request: Request, session: Session = Depends(get_session)):
    user = _maybe_user(request, session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to delete a preset.")
    row = session.exec(select(UiPreset).where(UiPreset.name == name.strip()[:40])).first()
    if not row:
        raise HTTPException(status_code=404, detail="Preset not found.")
    if row.created_by_id not in (None, user.id):
        raise HTTPException(status_code=403, detail="Only the publisher can delete this preset.")
    session.delete(row)
    session.commit()
    return {"ok": True}


class ImageIn(BaseModel):
    """A compressed background image as a data: URL (produced by the browser)."""
    data_url: str = Field(min_length=32)


@router.post("/image")
def upload_preset_image(body: ImageIn, request: Request, session: Session = Depends(get_session)):
    """Store a preset background image and return its public URL.

    Publishing a preset uploads the picture here first, so the shared preset can
    reference a URL instead of embedding megabytes of base64 — and visitors who
    are not signed in can still load it.
    """
    user = _maybe_user(request, session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to share a background image.")

    m = re.match(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", body.data_url.strip(), re.I | re.S)
    if not m:
        raise HTTPException(status_code=400, detail="Unsupported image format.")
    ext = {"jpg": "jpeg"}.get(m.group(1).lower(), m.group(1).lower())
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="The image could not be decoded.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="That image is too large (max 4 MB after compression).")

    name = f"{hashlib.sha256(raw).hexdigest()[:24]}.{'jpg' if ext == 'jpeg' else ext}"
    path = MEDIA_DIR / name
    if not path.exists():
        path.write_bytes(raw)
    return {"ok": True, "url": f"/api/presets/image/{name}"}


@router.get("/image/{name}")
def get_preset_image(name: str):
    """Serve a shared background image — PUBLIC, like the preset list itself."""
    safe = re.sub(r"[^A-Za-z0-9._-]", "", name)[:64]
    path = MEDIA_DIR / safe
    if not safe or not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    media = "image/png" if safe.endswith(".png") else "image/webp" if safe.endswith(".webp") else "image/jpeg"
    return FileResponse(str(path), media_type=media,
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})
