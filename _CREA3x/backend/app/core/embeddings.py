"""Text-embeddings client for the Knowledge Base (RAG), via OpenRouter.

Embeddings power the semantic ("FAISS") retrieval. They are requested through
OpenRouter using the SAME OPENROUTER_API_KEY (OpenAI-compatible POST /embeddings)
so no extra provider/key is needed. `EMBEDDINGS_BASE_URL` / `EMBEDDINGS_API_KEY`
can override the endpoint to any other OpenAI-compatible embeddings provider.

Embeddings are OPTIONAL: when no key is configured, or OpenRouter does not serve
embeddings for the chosen model, `embed()` returns None and callers fall back to
BM25 keyword retrieval, so the Knowledge Base still works.
"""

from __future__ import annotations

import logging

import httpx

from .config import settings

logger = logging.getLogger(__name__)


def _base() -> str:
    # Prefer an explicit embeddings base URL; otherwise use OpenRouter's.
    base = (settings.embeddings_base_url or settings.openrouter_base_url or "").strip()
    return base.rstrip("/")


def _key() -> str:
    return (settings.embeddings_api_key or settings.openrouter_api_key or "").strip()


def is_configured() -> bool:
    """True when an embeddings key + usable base URL are set."""
    base = _base()
    return bool(_key() and base.lower().startswith(("http://", "https://")))


def _headers() -> dict[str, str]:
    headers = {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}
    # OpenRouter attribution headers (harmless for other providers).
    if settings.openrouter_site_url:
        headers["HTTP-Referer"] = settings.openrouter_site_url
    if settings.openrouter_app_name:
        headers["X-Title"] = settings.openrouter_app_name
    return headers


def embed(texts: list[str]) -> list[list[float]] | None:
    """Embed a list of texts. Returns one vector per input, or None if disabled.

    OpenAI-compatible: POST {base}/embeddings {model, input:[...]}. On any error
    returns None so callers degrade to BM25 rather than failing the request.
    """
    texts = [t for t in (texts or []) if t and t.strip()]
    if not texts or not is_configured():
        return None

    url = f"{_base()}/embeddings"
    payload = {"model": (settings.embeddings_model or "").strip(), "input": texts}
    # Keep short: if embeddings are slow/unsupported, degrade to BM25 fast rather
    # than compounding latency behind a tunnel (which would time out to 502).
    timeout = min(float(settings.openrouter_timeout_seconds or 15), 15.0)
    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(url, json=payload, headers=_headers())
        if r.status_code >= 400:
            logger.warning("Embeddings endpoint returned %s: %s", r.status_code, r.text[:160])
            return None
        data = r.json()
    except (httpx.RequestError, ValueError) as e:
        logger.warning("Embeddings endpoint unreachable: %s", type(e).__name__)
        return None

    rows = data.get("data") or []
    out: list[list[float]] = []
    for item in rows:
        vals = item.get("embedding") if isinstance(item, dict) else None
        if vals is None:
            continue
        out.append([float(x) for x in vals])
    if len(out) != len(texts):
        logger.warning("Embeddings count mismatch: got %d for %d inputs", len(out), len(texts))
        return None
    return out


def embed_one(text: str) -> list[float] | None:
    res = embed([text])
    return res[0] if res else None
