"""Public app configuration + dev-only on-the-fly theme/font persistence.

GET  /api/app-config   -> { deployment_environment, font_type, theme_type }  (public)
POST /api/app-config   -> persist FONT_TYPE / THEME_TYPE to backend .env       (dev only)

The dev toolbar uses POST to "fix" a chosen theme/font into the .env file so it
is applied in production (where the toolbar is hidden). Writing is refused when
DEPLOYMENT_ENVIRONMENT != dev.
"""
from __future__ import annotations

import os
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.config import settings

router = APIRouter(prefix="/api/app-config", tags=["app-config"])


def _is_dev() -> bool:
    return settings.deployment_environment.strip().lower() == "dev"


class AppConfigOut(BaseModel):
    deployment_environment: str
    font_type: str
    theme_type: str
    google_oauth_enabled: bool = False


class AppConfigIn(BaseModel):
    font_type: Optional[str] = None
    theme_type: Optional[str] = None


def _env_path() -> str:
    # WORKDIR is /app inside the container; /app/.env is the mounted backend/.env.
    for cand in (".env", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")):
        if os.path.exists(cand):
            return cand
    return ".env"


def _upsert_env(path: str, updates: dict[str, str]) -> None:
    lines: list[str] = []
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.read().splitlines()

    remaining = dict(updates)
    out: list[str] = []
    for line in lines:
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
        if m and m.group(1) in remaining:
            key = m.group(1)
            out.append(f"{key}={remaining.pop(key)}")
        else:
            out.append(line)
    for key, val in remaining.items():
        out.append(f"{key}={val}")

    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


@router.get("", response_model=AppConfigOut)
def get_app_config() -> AppConfigOut:
    return AppConfigOut(
        deployment_environment=settings.deployment_environment,
        font_type=settings.font_type,
        theme_type=settings.theme_type,
        google_oauth_enabled=bool(settings.google_oauth_client_id and settings.google_oauth_client_secret),
    )


@router.post("", response_model=AppConfigOut)
def set_app_config(body: AppConfigIn) -> AppConfigOut:
    if not _is_dev():
        raise HTTPException(status_code=403, detail="Config can only be changed in dev")

    updates: dict[str, str] = {}
    if body.font_type:
        settings.font_type = body.font_type
        updates["FONT_TYPE"] = body.font_type
    if body.theme_type:
        settings.theme_type = body.theme_type
        updates["THEME_TYPE"] = body.theme_type

    if updates:
        try:
            _upsert_env(_env_path(), updates)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Failed to write .env: {exc}")

    return AppConfigOut(
        deployment_environment=settings.deployment_environment,
        font_type=settings.font_type,
        theme_type=settings.theme_type,
        google_oauth_enabled=bool(settings.google_oauth_client_id and settings.google_oauth_client_secret),
    )
