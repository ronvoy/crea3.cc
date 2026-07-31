"""Google Gemini client for voice: transcription (STT) and, later, TTS.

Optional — only used when GEMINI_API_KEY is set. STT/TTS have no OpenRouter
equivalent (OpenRouter has no audio API), so Gemini is one of the supported
server-side voice backends alongside a configurable OpenAI-compatible endpoint.
"""

from __future__ import annotations

import base64
import logging

import httpx

from .config import settings

logger = logging.getLogger(__name__)


class GeminiError(RuntimeError):
    pass


def is_configured() -> bool:
    base = (settings.gemini_base_url or "").strip()
    return bool((settings.gemini_api_key or "").strip() and base.lower().startswith(("http://", "https://")))


def _model_path(model: str) -> str:
    return model if model.startswith("models/") else f"models/{model}"


def transcribe(audio: bytes, mime_type: str, lang: str | None = None) -> str:
    """Transcribe audio bytes to text via Gemini generateContent (inline audio)."""
    if not is_configured():
        raise GeminiError("Gemini is not configured (set GEMINI_API_KEY).")
    base = settings.gemini_base_url.rstrip("/")
    model = _model_path(settings.gemini_stt_model or "gemini-2.5-flash")
    lang_hint = f" The spoken language is {lang}." if lang else ""
    prompt = (
        "Transcribe the following audio to plain text verbatim." + lang_hint +
        " Output ONLY the transcript text, with no quotes, labels or commentary."
    )
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type or "audio/webm", "data": base64.b64encode(audio).decode("ascii")}},
            ],
        }],
        "generationConfig": {"temperature": 0.0},
    }
    try:
        with httpx.Client(timeout=settings.gemini_timeout_seconds) as client:
            r = client.post(f"{base}/{model}:generateContent",
                            params={"key": settings.gemini_api_key}, json=payload)
        if r.status_code >= 400:
            raise GeminiError(f"Gemini STT returned {r.status_code}: {r.text[:160]}")
        data = r.json()
    except httpx.RequestError as e:
        raise GeminiError(f"Gemini unreachable: {type(e).__name__}") from e

    try:
        parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts).strip()
    except Exception as e:
        raise GeminiError("Gemini STT returned an unexpected response.") from e
    return text
