"""Minimal client for a locally-hosted Ollama server.

The model is taken from settings.ollama_model and can be swapped by changing a
single env var (OLLAMA_MODEL). This module exposes both a model listing helper
(so the frontend can offer a model picker) and a chat call.
"""

from __future__ import annotations

import json
from typing import Any, Iterator

import httpx

from .config import settings


class OllamaError(RuntimeError):
    pass


class OllamaUnavailable(OllamaError):
    pass


def _base() -> str:
    return settings.ollama_base_url.rstrip("/")


def _require_base() -> str:
    """Return a usable base URL, or raise a clear 'not configured' error.

    Guards the common case where OLLAMA_BASE_URL is empty or missing the
    http(s):// scheme — which otherwise surfaces as a cryptic httpx
    'UnsupportedProtocol' error.
    """
    base = _base()
    if not base or not base.lower().startswith(("http://", "https://")):
        raise OllamaUnavailable(
            "The workflow assistant isn't configured on this server. "
            "Set OLLAMA_BASE_URL to a running Ollama server "
            "(e.g. http://host.docker.internal:11434) to enable it."
        )
    return base


def list_models() -> list[str]:
    """Return the names of models installed on the Ollama server."""
    base = _require_base()
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{base}/api/tags")
            r.raise_for_status()
            data = r.json()
    except httpx.RequestError as e:
        raise OllamaUnavailable(f"Ollama server unreachable: {type(e).__name__}") from e
    except httpx.HTTPStatusError as e:
        raise OllamaError(f"Ollama returned {e.response.status_code}") from e

    models = data.get("models") or []
    return [m.get("name") for m in models if m.get("name")]


def chat(
    *,
    system: str,
    user_message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
    timeout: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """Send a chat request to Ollama and return the assistant's text.

    `model` overrides settings.ollama_model for this single call (lets the user
    pick a model from the UI without changing server config).
    `history` is an optional list of {"role": "user"|"assistant", "content": str}.
    `timeout` overrides settings.ollama_timeout_seconds for this call (used to
    keep quick tasks like intent classification from blowing a proxy timeout).
    `max_tokens` overrides settings.assistant_max_tokens (background tasks like
    'What if' want a full-length answer, not the short chat cap).
    """
    chosen = (model or settings.ollama_model).strip()

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for turn in (history or []):
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": chosen,
        "messages": messages,
        "stream": False,
        # Low temperature: this is a factual how-to assistant, not creative.
        # num_predict caps the output so a long answer can't overrun a proxy window.
        "options": {"temperature": 0.2, "num_predict": (max_tokens or settings.assistant_max_tokens)},
    }

    try:
        with httpx.Client(timeout=(timeout or settings.ollama_timeout_seconds)) as client:
            r = client.post(f"{_require_base()}/api/chat", json=payload)
    except httpx.RequestError as e:
        raise OllamaUnavailable(f"Ollama server unreachable: {type(e).__name__}") from e

    if r.status_code == 404:
        # Most common cause: the model isn't pulled yet.
        raise OllamaError(
            f"Model '{chosen}' not found on the Ollama server. Pull it first: `ollama pull {chosen}`."
        )
    if r.status_code >= 400:
        raise OllamaError(f"Ollama returned {r.status_code}: {r.text[:200]}")

    data = r.json()
    msg = (data.get("message") or {}).get("content")
    if not msg:
        raise OllamaError("Ollama returned an empty response.")
    return str(msg).strip()


def chat_stream(
    *,
    system: str,
    user_message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
    timeout: float | None = None,
) -> Iterator[str]:
    """Stream an Ollama chat reply as incremental text chunks.

    Connection errors raise OllamaUnavailable on the FIRST iteration (before any
    text is yielded), so callers can fail over to another provider cleanly.
    """
    chosen = (model or settings.ollama_model).strip()
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for turn in (history or []):
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": chosen,
        "messages": messages,
        "stream": True,
        "options": {"temperature": 0.2, "num_predict": settings.assistant_max_tokens},
    }
    base = _require_base()
    try:
        with httpx.Client(timeout=(timeout or settings.ollama_timeout_seconds)) as client:
            with client.stream("POST", f"{base}/api/chat", json=payload) as r:
                if r.status_code == 404:
                    raise OllamaError(f"Model '{chosen}' not found on the Ollama server.")
                if r.status_code >= 400:
                    raise OllamaError(f"Ollama returned {r.status_code}.")
                for line in r.iter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except ValueError:
                        continue
                    msg = (data.get("message") or {}).get("content")
                    if msg:
                        yield msg
                    if data.get("done"):
                        break
    except httpx.RequestError as e:
        raise OllamaUnavailable(f"Ollama server unreachable: {type(e).__name__}") from e
