"""Speech-to-text dispatcher (server-side).

Order of preference:
  1. A configurable OpenAI-compatible endpoint (STT_BASE_URL + STT_API_KEY):
     works with Groq (free Whisper), OpenAI, or a self-hosted whisper server.
  2. Gemini (GEMINI_API_KEY).
When neither is configured, `available()` is False and the client transcribes in
the browser via the Web Speech API instead.
"""

from __future__ import annotations

import logging

import httpx

from .config import settings
from . import gemini

logger = logging.getLogger(__name__)


class SttError(RuntimeError):
    pass


class SttUnavailable(SttError):
    pass


def _openai_configured() -> bool:
    base = (settings.stt_base_url or "").strip()
    return bool((settings.stt_api_key or "").strip() and base.lower().startswith(("http://", "https://")))


def available() -> bool:
    return _openai_configured() or gemini.is_configured()


def transcribe(audio: bytes, mime_type: str, filename: str = "audio.webm", lang: str | None = None) -> str:
    """Transcribe audio to text. Raises SttUnavailable when no backend is set."""
    if _openai_configured():
        base = settings.stt_base_url.rstrip("/")
        files = {"file": (filename, audio, mime_type or "audio/webm")}
        data = {"model": settings.stt_model or "whisper-1"}
        if lang:
            data["language"] = lang
        headers = {"Authorization": f"Bearer {settings.stt_api_key}"}
        try:
            with httpx.Client(timeout=settings.gemini_timeout_seconds) as client:
                r = client.post(f"{base}/audio/transcriptions", files=files, data=data, headers=headers)
            if r.status_code >= 400:
                raise SttError(f"STT endpoint returned {r.status_code}: {r.text[:160]}")
            body = r.json()
        except httpx.RequestError as e:
            raise SttError(f"STT endpoint unreachable: {type(e).__name__}") from e
        return str(body.get("text", "")).strip()

    if gemini.is_configured():
        try:
            return gemini.transcribe(audio, mime_type, lang)
        except gemini.GeminiError as e:
            raise SttError(str(e)) from e

    raise SttUnavailable("No server-side STT configured; use the browser recognizer.")
