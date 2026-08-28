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


def similar_cases(question: str, *, k: int = 3, countries: list[str] | None = None) -> list[dict]:
    """Fetch similar case documents from the chatbot's legal knowledge base.

    Best-effort: returns [] when the chatbot is not configured/reachable so the
    past-cases answer simply omits the KB section instead of failing.
    """
    base = (settings.legal_ai_url or "").strip().rstrip("/")
    if not base:
        return []
    if base.endswith("/chat"):
        base = base[: -len("/chat")]
    try:
        # Read allows for a cold chatbot (first call loads the case shards).
        timeout = httpx.Timeout(connect=4.0, read=35.0, write=5.0, pool=4.0)
        params: dict = {"q": question, "k": k}
        if countries:
            params["countries"] = ",".join(countries)
        with httpx.Client(timeout=timeout) as client:
            res = client.get(f"{base}/cases/retrieve", params=params)
        if res.status_code >= 400:
            return []
        cases = (res.json() or {}).get("cases") or []
        return cases if isinstance(cases, list) else []
    except Exception as exc:  # noqa: BLE001 — never let KB lookup break the answer
        logger.info("similar_cases lookup failed: %s", exc)
        return []


def _service_base() -> str:
    base = (settings.legal_ai_url or "").strip().rstrip("/")
    if base.endswith("/chat"):
        base = base[: -len("/chat")]
    return base


def list_sources(question: str, *, k: int = 3, cases: bool = False) -> list[dict]:
    """Names of the KB passages that ground an answer (best-effort, [] on failure).

    cases=True lists case-law documents (ITD001 …) from the *_cases_* shards;
    otherwise statute passages from the merged legal index.
    """
    base = _service_base()
    if not base:
        return []
    try:
        timeout = httpx.Timeout(connect=4.0, read=20.0, write=5.0, pool=4.0)
        with httpx.Client(timeout=timeout) as client:
            res = client.get(f"{base}/sources",
                             params={"q": question, "k": k, "cases": int(cases)})
        if res.status_code >= 400:
            return []
        srcs = (res.json() or {}).get("sources") or []
        return srcs if isinstance(srcs, list) else []
    except Exception as exc:  # noqa: BLE001
        logger.info("list_sources lookup failed: %s", exc)
        return []


def fetch_source_page(question: str, *, k: int = 4, cases: bool = False,
                      case_id: str | None = None) -> str | None:
    """Fetch the chatbot's /source/view HTML so the platform can proxy it to the
    browser (the chatbot itself is not exposed through the public tunnel).
    `case_id` fetches ONE specific case document instead of a query retrieval."""
    base = _service_base()
    if not base:
        return None
    try:
        params: dict = {"q": question, "k": k, "cases": int(cases)}
        if case_id:
            params["case_id"] = case_id
        timeout = httpx.Timeout(connect=4.0, read=30.0, write=5.0, pool=4.0)
        with httpx.Client(timeout=timeout) as client:
            res = client.get(f"{base}/source/view", params=params)
        if res.status_code >= 400:
            return None
        return res.text
    except Exception as exc:  # noqa: BLE001
        logger.info("fetch_source_page failed: %s", exc)
        return None


_reach_cache: dict = {"ts": 0.0, "ok": False}


def is_reachable(max_age: float = 15.0) -> bool:
    """Cheap cached health probe of the chatbot (used to flag answers that had
    to do without it — the UI's 'external model' marker)."""
    import time as _t
    now = _t.monotonic()
    if now - _reach_cache["ts"] < max_age:
        return _reach_cache["ok"]
    ok = False
    base = _service_base()
    if base:
        try:
            with httpx.Client(timeout=httpx.Timeout(connect=2.0, read=3.0, write=2.0, pool=2.0)) as client:
                ok = client.get(f"{base}/health").status_code == 200
        except Exception:
            ok = False
    _reach_cache["ts"] = now
    _reach_cache["ok"] = ok
    return ok
