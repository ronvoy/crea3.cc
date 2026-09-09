from __future__ import annotations

"""Lightweight real-time web lookup for the asset-valuation assistant.

When the knowledge base has nothing useful about an asset (a specific car
model, a local property market, a listed share), the estimator enriches its
prompt with a handful of fresh result snippets so the figure is anchored to
what the market is actually asking today rather than to model memory alone.

No API key is required: the crawler uses DuckDuckGo's HTML endpoint and reads
only result titles and snippets. It is deliberately defensive — short timeout,
capped size, and it returns an empty list on any problem so valuation still
works offline.
"""

import html
import logging
import re

import httpx

logger = logging.getLogger(__name__)

_UA = "Mozilla/5.0 (compatible; CREA3-Estimator/1.0; +https://crea3.cc)"
_RESULT_RE = re.compile(
    r'<a[^>]+class="result__a"[^>]*>(?P<title>.*?)</a>.*?'
    r'<a[^>]+class="result__snippet"[^>]*>(?P<snippet>.*?)</a>',
    re.S | re.I,
)


def _clean(fragment: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", fragment or "")).strip()


def search(query: str, *, limit: int = 5, timeout: float = 8.0) -> list[dict]:
    """Return up to `limit` {title, snippet} results, or [] when unavailable."""
    q = (query or "").strip()
    if not q:
        return []
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True,
                          headers={"User-Agent": _UA, "Accept-Language": "en,it;q=0.8"}) as client:
            resp = client.post("https://html.duckduckgo.com/html/", data={"q": q, "kl": "wt-wt"})
        if resp.status_code != 200:
            return []
        out: list[dict] = []
        for m in _RESULT_RE.finditer(resp.text[:400_000]):
            title, snippet = _clean(m.group("title")), _clean(m.group("snippet"))
            if title and snippet:
                out.append({"title": title[:200], "snippet": snippet[:400]})
            if len(out) >= limit:
                break
        return out
    except Exception as exc:                    # network blocked, layout change…
        logger.info("estimator web search unavailable: %s", exc)
        return []


def as_context(results: list[dict]) -> str:
    """Render results as a compact block for the model prompt."""
    if not results:
        return ""
    lines = [f"- {r['title']}: {r['snippet']}" for r in results]
    return "LIVE WEB RESULTS (retrieved just now — use for current price levels):\n" + "\n".join(lines)
