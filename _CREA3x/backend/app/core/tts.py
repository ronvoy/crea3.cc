"""Text-to-speech (server-side), via a configurable OpenAI-compatible endpoint.

POST {TTS_BASE_URL}/audio/speech {model, input, voice, response_format} — the
protocol used by OpenAI TTS and by a self-hosted Kokoro (Kokoro-FastAPI). When
no endpoint is configured, `available()` is False and the client falls back to
the browser's speechSynthesis.
"""

from __future__ import annotations

import logging

import httpx

from .config import settings

logger = logging.getLogger(__name__)


class TtsError(RuntimeError):
    pass


class TtsUnavailable(TtsError):
    pass


_FORMAT_MIME = {"mp3": "audio/mpeg", "opus": "audio/ogg", "aac": "audio/aac",
                "flac": "audio/flac", "wav": "audio/wav", "pcm": "audio/wave"}


def available() -> bool:
    base = (settings.tts_base_url or "").strip()
    return bool(base.lower().startswith(("http://", "https://")))


def synthesize(text: str, lang: str | None = None, voice: str | None = None) -> tuple[bytes, str]:
    """Synthesize speech. Returns (audio_bytes, mime). Raises TtsUnavailable when off."""
    if not available():
        raise TtsUnavailable("No server-side TTS configured; use the browser voice.")
    base = settings.tts_base_url.rstrip("/")
    fmt = (settings.tts_format or "mp3").lower()
    payload = {
        "model": settings.tts_model or "kokoro",
        "input": text[:4000],
        "voice": voice or settings.tts_voice or "af_bella",
        "response_format": fmt,
    }
    headers = {"Content-Type": "application/json"}
    if (settings.tts_api_key or "").strip():
        headers["Authorization"] = f"Bearer {settings.tts_api_key}"
    try:
        with httpx.Client(timeout=settings.gemini_timeout_seconds) as client:
            r = client.post(f"{base}/audio/speech", json=payload, headers=headers)
        if r.status_code >= 400:
            raise TtsError(f"TTS endpoint returned {r.status_code}: {r.text[:160]}")
    except httpx.RequestError as e:
        raise TtsError(f"TTS endpoint unreachable: {type(e).__name__}") from e
    return r.content, _FORMAT_MIME.get(fmt, "audio/mpeg")
