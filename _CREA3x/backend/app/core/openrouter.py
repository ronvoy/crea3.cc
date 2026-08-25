"""Client for OpenRouter (https://openrouter.ai) — a hosted, OpenAI-compatible
chat API.

This is the FALLBACK for the workflow assistant: core.llm tries the local Ollama
server first and only comes here when Ollama is unreachable (e.g. a host with no
Ollama, or Docker that cannot route to host.docker.internal). Set
OPENROUTER_API_KEY to enable it; without a key the fallback stays off and the
assistant behaves exactly as before.

Latency matters: behind a tunnel (serveo/Cloudflare) a slow reply is cut off by
the proxy and the widget just says "offline". Free models vary a lot, so keep
OPENROUTER_TIMEOUT_SECONDS below the proxy's own timeout and prefer a model with
*consistent* latency over a bigger, spikier one.
"""

from __future__ import annotations

import json
from typing import Any, Iterator

import httpx

from .config import settings


class OpenRouterError(RuntimeError):
    pass


class OpenRouterUnavailable(OpenRouterError):
    pass


def _base() -> str:
    return (settings.openrouter_base_url or "").rstrip("/")


def is_configured() -> bool:
    """True when OpenRouter can serve as a fallback (key + usable base URL)."""
    base = _base()
    return bool(
        (settings.openrouter_api_key or "").strip()
        and base
        and base.lower().startswith(("http://", "https://"))
    )


def _model_candidates(override: str | None = None) -> list[str]:
    """Ordered, de-duplicated list of models to try.

    OPENROUTER_MODEL may be a single id or a comma-separated list; a per-request
    override (from the UI) is tried first. Trying several ids of different
    providers means the assistant keeps working when one free model is retired
    or rate-limited.
    """
    raw = f"{override or ''},{settings.openrouter_model or ''}"
    seen: set[str] = set()
    out: list[str] = []
    for m in raw.split(","):
        m = m.strip()
        # Strict policy: only Mistral / Ministral models may be used. Any other
        # provider (OpenAI, Google, etc.) is dropped even if it is configured, so
        # a stray id can never be selected or surface in a reply.
        if m and m not in seen and ("mistral" in m.lower() or "ministral" in m.lower()):
            seen.add(m)
            out.append(m)
    # Never end up with an empty list — fall back to the free Mistral instruct.
    if not out:
        out.append("mistralai/mistral-7b-instruct:free")
    return out


def _require_config() -> tuple[str, str]:
    if not is_configured():
        raise OpenRouterUnavailable(
            "OpenRouter is not configured. Set OPENROUTER_API_KEY "
            "(https://openrouter.ai/keys) to enable the hosted fallback."
        )
    return _base(), (settings.openrouter_api_key or "").strip()


def _headers(key: str) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    # Optional attribution headers used by OpenRouter's rankings.
    if settings.openrouter_site_url:
        headers["HTTP-Referer"] = settings.openrouter_site_url
    if settings.openrouter_app_name:
        headers["X-Title"] = settings.openrouter_app_name
    return headers


def list_models() -> list[str]:
    """Return the free model ids on OpenRouter (for the model picker).

    Filtered to the free tier so the picker cannot select a billable model. The
    configured model is always included, even if it is a paid one.
    """
    base, _key = _require_config()
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{base}/models")
            r.raise_for_status()
            data = r.json()
    except httpx.RequestError as e:
        raise OpenRouterUnavailable(f"OpenRouter unreachable: {type(e).__name__}") from e
    except httpx.HTTPStatusError as e:
        raise OpenRouterError(f"OpenRouter returned {e.response.status_code}") from e

    ids = [m.get("id") for m in (data.get("data") or []) if m.get("id")]
    free = sorted(str(i) for i in ids if str(i).endswith(":free"))
    current = (settings.openrouter_model or "").strip()
    if current and current not in free:
        free.insert(0, current)
    return free


def chat(
    *,
    system: str,
    user_message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
) -> str:
    """Send a chat request to OpenRouter and return the assistant's text.

    Tries each configured model in order (OPENROUTER_MODEL may be a
    comma-separated list) and moves on to the next when a model is unavailable
    for free (404), rate-limited (429) or times out. This survives OpenRouter's
    frequent rotation of which free models exist — a single hard-coded id breaks
    the moment that model is retired, which is exactly what kept happening.

    Mirrors core.ollama.chat so the two are interchangeable.
    """
    base, key = _require_config()
    models = _model_candidates(model)

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for turn in (history or []):
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})

    last_soft_error: Exception | None = None
    for chosen in models:
        payload = {
            "model": chosen,
            "messages": messages,
            "stream": False,
            # Low temperature: this is a factual how-to assistant, not creative.
            "temperature": 0.2,
            # Cap output so a long reply can't overrun the tunnel/proxy window.
            "max_tokens": (max_tokens or settings.assistant_max_tokens),
        }
        try:
            with httpx.Client(timeout=settings.openrouter_timeout_seconds) as client:
                r = client.post(f"{base}/chat/completions", json=payload, headers=_headers(key))
        except httpx.TimeoutException as e:
            # Too slow — try the next candidate rather than failing outright.
            last_soft_error = OpenRouterUnavailable(
                f"'{chosen}' did not answer within "
                f"{settings.openrouter_timeout_seconds:.0f}s."
            )
            continue
        except httpx.RequestError as e:
            raise OpenRouterUnavailable(f"OpenRouter unreachable: {type(e).__name__}") from e

        # Hard errors: same for every model, so stop immediately.
        if r.status_code in (401, 403):
            raise OpenRouterError("OpenRouter rejected the API key (check OPENROUTER_API_KEY).")

        # Soft errors: this specific model can't serve the request now — the NEXT
        # candidate might, so remember the reason and keep going.
        if r.status_code == 402:
            last_soft_error = OpenRouterError(
                f"'{chosen}' needs paid credit (not free)."
            )
            continue
        if r.status_code == 404:
            last_soft_error = OpenRouterError(
                f"'{chosen}' is not available for free on OpenRouter."
            )
            continue
        if r.status_code == 429:
            last_soft_error = OpenRouterUnavailable(f"'{chosen}' is rate-limited upstream.")
            continue
        if r.status_code >= 400:
            last_soft_error = OpenRouterError(f"'{chosen}' returned {r.status_code}: {r.text[:120]}")
            continue

        try:
            data = r.json()
            msg = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
        except Exception:
            last_soft_error = OpenRouterError(f"'{chosen}' returned a malformed response.")
            continue

        if not msg:
            last_soft_error = OpenRouterError(f"'{chosen}' returned an empty response.")
            continue

        return str(msg).strip()

    # Every candidate failed. Surface the last concrete reason.
    tried = ", ".join(models)
    detail = f" ({last_soft_error})" if last_soft_error else ""
    if isinstance(last_soft_error, OpenRouterError) and not isinstance(
        last_soft_error, OpenRouterUnavailable
    ):
        raise OpenRouterError(f"No OpenRouter model could answer. Tried: {tried}.{detail}")
    raise OpenRouterUnavailable(f"No OpenRouter model is available right now. Tried: {tried}.{detail}")


def chat_stream(
    *,
    system: str,
    user_message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
) -> Iterator[str]:
    """Stream an OpenRouter reply as incremental text chunks.

    Tries each candidate model; the first one that returns HTTP 200 is streamed
    (soft errors 402/404/429 skip to the next). Raises before yielding any text
    if none can serve, so a caller can fail over cleanly.
    """
    base, key = _require_config()
    models = _model_candidates(model)

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for turn in (history or []):
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})

    last_error: Exception | None = None
    with httpx.Client(timeout=settings.openrouter_timeout_seconds) as client:
        for chosen in models:
            payload = {
                "model": chosen, "messages": messages, "stream": True,
                "temperature": 0.2, "max_tokens": settings.assistant_max_tokens,
            }
            try:
                with client.stream("POST", f"{base}/chat/completions", json=payload, headers=_headers(key)) as r:
                    if r.status_code in (401, 403):
                        raise OpenRouterError("OpenRouter rejected the API key (check OPENROUTER_API_KEY).")
                    if r.status_code in (402, 404):
                        last_error = OpenRouterError(f"'{chosen}' is not available for free.")
                        continue
                    if r.status_code == 429:
                        last_error = OpenRouterUnavailable(f"'{chosen}' is rate-limited upstream.")
                        continue
                    if r.status_code >= 400:
                        last_error = OpenRouterError(f"'{chosen}' returned {r.status_code}.")
                        continue
                    got = False
                    for line in r.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                            delta = ((obj.get("choices") or [{}])[0].get("delta") or {}).get("content")
                        except ValueError:
                            continue
                        if delta:
                            got = True
                            yield delta
                    if got:
                        return
                    last_error = OpenRouterError(f"'{chosen}' streamed an empty response.")
                    continue
            except httpx.TimeoutException:
                last_error = OpenRouterUnavailable(f"'{chosen}' did not start in time.")
                continue
            except httpx.RequestError as e:
                raise OpenRouterUnavailable(f"OpenRouter unreachable: {type(e).__name__}") from e

    if isinstance(last_error, OpenRouterError) and not isinstance(last_error, OpenRouterUnavailable):
        raise OpenRouterError(f"No OpenRouter model could stream. ({last_error})")
    raise OpenRouterUnavailable(f"No OpenRouter model is available. ({last_error})")
