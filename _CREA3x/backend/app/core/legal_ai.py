"""Client for the self-hosted CREA3 LexAI legal chatbot (the _CREA3-Chatbot service).

This is the PRIMARY provider for legal questions: a local Docker RAG service
(Mistral + FAISS over the jurisdiction corpora) reached at `settings.legal_ai_url`
(e.g. http://localhost:8094/chat). When it is unreachable or errors, the caller
falls back to OpenRouter Mistral (the "external" secondary) — see core/llm.py.

The upstream `/chat` endpoint is NOT streaming: it returns a full `{answer, …}`
JSON. `ask_stream` therefore fetches the whole answer and re-emits it in small
chunks so the widget still renders a typing effect.
"""

from __future__ import annotations

import logging
from typing import Iterator

import httpx

from .config import settings

logger = logging.getLogger(__name__)

MODEL_LABEL = "crea3-lexai"


class LegalAIError(RuntimeError):
    """The chatbot was reached but could not answer (bad status / empty answer)."""


class LegalAIUnavailable(LegalAIError):
    """The chatbot is not configured or not reachable — a reason to fall back."""


def is_configured() -> bool:
    return bool((settings.legal_ai_url or "").strip())


def _stream_url() -> str:
    """Derive the chatbot's streaming endpoint from the configured /chat URL."""
    base = (settings.legal_ai_url or "").strip().rstrip("/")
    if base.endswith("/chat"):
        return base + "/stream"
    if base.endswith("/chat/stream"):
        return base
    return base + "/chat/stream"


def ask(question: str, *, lang: str | None = None) -> str:
    """POST the question to the LexAI chatbot and return its answer text."""
    upstream = (settings.legal_ai_url or "").strip()
    if not upstream:
        raise LegalAIUnavailable("Legal AI chatbot not configured (LEGAL_AI_URL unset).")

    body: dict = {"question": question}
    if lang:
        body["lang"] = lang

    # Fail FAST on connect (so a down chatbot falls back to OpenRouter in seconds,
    # not after the full read budget), but allow a long READ — the RAG round-trip
    # can legitimately take 20-30s.
    timeout = httpx.Timeout(
        connect=4.0,
        read=settings.legal_ai_timeout_seconds,
        write=10.0,
        pool=4.0,
    )
    try:
        with httpx.Client(timeout=timeout) as client:
            res = client.post(upstream, json=body)
    except httpx.RequestError as e:
        raise LegalAIUnavailable(f"chatbot unreachable: {type(e).__name__}") from e

    if res.status_code >= 400:
        raise LegalAIError(f"chatbot returned HTTP {res.status_code}")

    data = res.json() if res.content else {}
    answer = data.get("answer") or data.get("reply") or data.get("response") or data.get("message")
    if not answer or not str(answer).strip():
        raise LegalAIError("chatbot returned an empty answer")
    return str(answer).strip()


def _chunk(text: str, size: int = 48) -> Iterator[str]:
    """Split text into word-preserving chunks for a streaming-like effect."""
    buf = ""
    for word in text.split(" "):
        piece = (buf + " " + word) if buf else word
        if len(piece) >= size:
            yield piece + " "
            buf = ""
        else:
            buf = piece
    if buf:
        yield buf


def ask_stream(question: str, *, lang: str | None = None) -> Iterator[str]:
    """Stream the chatbot's answer token-by-token from `/chat/stream`.

    Streaming keeps the connection continuously fed (first byte in ~3s), which
    avoids the long silent gap of the blocking `/chat` call that some tunnels
    drop. Falls back to the blocking `/chat` (re-chunked) when the chatbot build
    has no streaming endpoint (404). Raises LegalAIUnavailable/LegalAIError so the
    caller can fall back to OpenRouter when the chatbot can't answer at all.
    """
    if not is_configured():
        raise LegalAIUnavailable("Legal AI chatbot not configured (LEGAL_AI_URL unset).")

    body: dict = {"question": question}
    if lang:
        body["lang"] = lang
    # Fail fast on connect; allow a long read for the full streamed answer.
    timeout = httpx.Timeout(connect=4.0, read=settings.legal_ai_timeout_seconds, write=10.0, pool=4.0)

    use_blocking = False
    try:
        with httpx.Client(timeout=timeout) as client:
            with client.stream("POST", _stream_url(), json=body) as resp:
                if resp.status_code == 404:
                    use_blocking = True  # older chatbot without /chat/stream
                elif resp.status_code >= 400:
                    raise LegalAIError(f"chatbot stream returned HTTP {resp.status_code}")
                else:
                    got = False
                    for text in resp.iter_text():
                        if text:
                            got = True
                            yield text
                    if not got:
                        raise LegalAIError("chatbot stream returned nothing")
                    return
    except httpx.RequestError as e:
        raise LegalAIUnavailable(f"chatbot unreachable: {type(e).__name__}") from e

    if use_blocking:
        yield from _chunk(ask(question, lang=lang))
