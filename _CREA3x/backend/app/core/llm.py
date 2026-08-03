"""Workflow-assistant LLM access with graceful fallback.

Ollama (local) is always tried FIRST and stays the primary provider. If — and
only if — the Ollama endpoint is *unavailable* (not configured, unreachable, or
timing out), the call is retried against OpenRouter, provided an
OPENROUTER_API_KEY is set. Nothing is overridden: while Ollama answers, the
behaviour is exactly as before, and with no OpenRouter key the original Ollama
error is surfaced unchanged.

Errors from a provider that *did* answer (e.g. a model that isn't pulled) are
NOT a reason to fail over — they are real errors and are reported as such.

Every fallback and failure is logged, because both providers previously failed
silently: the widget showed a generic "offline" with no way to tell a rate limit
from a timeout from a missing key.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterator

from . import ollama, openrouter
from .config import settings

logger = logging.getLogger(__name__)

OLLAMA = "ollama"
OPENROUTER = "openrouter"


class LLMError(RuntimeError):
    """A provider was reached but could not answer."""


class LLMUnavailable(LLMError):
    """No provider is reachable/configured."""


@dataclass
class ChatResult:
    text: str
    model: str
    provider: str


@dataclass
class ModelsInfo:
    current: str
    available: list[str]
    provider: str


def chat(
    *,
    system: str,
    user_message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
    openrouter_model: str | None = None,
) -> ChatResult:
    """Answer via Ollama, falling back to OpenRouter when Ollama is unavailable.

    `model` names the preferred Ollama model. `openrouter_model` optionally pins
    the OpenRouter fallback to a specific model (e.g. the Legal assistant pins
    Mistral); when None the fallback uses the configured OPENROUTER_MODEL list.
    """
    try:
        text = ollama.chat(
            system=system, user_message=user_message, history=history, model=model
        )
        return ChatResult(text=text, model=(model or settings.ollama_model), provider=OLLAMA)
    except ollama.OllamaUnavailable as unavailable:
        if not openrouter.is_configured():
            logger.warning(
                "Assistant unavailable: Ollama is unreachable (%s) and no "
                "OPENROUTER_API_KEY is set, so there is no fallback.",
                unavailable,
            )
            raise LLMUnavailable(str(unavailable)) from unavailable
        logger.info("Ollama unavailable (%s) — falling back to OpenRouter", unavailable)
    except ollama.OllamaError as e:
        # Ollama answered but refused (e.g. model not pulled): a real error.
        logger.warning("Ollama refused the request: %s", e)
        raise LLMError(str(e)) from e

    # `model` names an Ollama model (e.g. "llama3.2:3b"), which OpenRouter would
    # reject — let OpenRouter use `openrouter_model` (if pinned) or its own
    # configured model list instead.
    try:
        text = openrouter.chat(
            system=system, user_message=user_message, history=history, model=openrouter_model
        )
    except openrouter.OpenRouterUnavailable as e:
        logger.warning("OpenRouter fallback unavailable: %s", e)
        raise LLMUnavailable(f"The assistant is unavailable: {e}") from e
    except openrouter.OpenRouterError as e:
        logger.warning("OpenRouter fallback failed: %s", e)
        raise LLMError(str(e)) from e
    return ChatResult(text=text, model=(openrouter_model or settings.openrouter_model), provider=OPENROUTER)


def chat_stream(
    *,
    system: str,
    user_message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
    openrouter_model: str | None = None,
    meta: dict | None = None,
) -> Iterator[str]:
    """Stream a reply, Ollama first then OpenRouter (Mistral-pinned) fallback.

    Yields incremental text chunks. `meta` (if given) is populated with the
    provider/model that actually served the stream. Raises LLMUnavailable/LLMError
    only before any text is yielded (once streaming starts we commit to it).
    """
    meta = meta if meta is not None else {}

    # 1) Try Ollama. Connection/availability errors surface on the first chunk.
    try:
        gen = ollama.chat_stream(system=system, user_message=user_message, history=history, model=model)
        first = next(gen)
        meta["provider"] = OLLAMA
        meta["model"] = (model or settings.ollama_model)
        yield first
        yield from gen
        return
    except ollama.OllamaUnavailable as unavailable:
        if not openrouter.is_configured():
            raise LLMUnavailable(str(unavailable)) from unavailable
        logger.info("Ollama unavailable (%s) — streaming from OpenRouter", unavailable)
    except ollama.OllamaError as e:
        if not openrouter.is_configured():
            raise LLMError(str(e)) from e
        logger.info("Ollama error (%s) — streaming from OpenRouter", e)
    except StopIteration:
        pass  # Ollama produced nothing; fall through to OpenRouter.

    # 2) OpenRouter fallback (pinned to `openrouter_model` when given).
    try:
        gen = openrouter.chat_stream(system=system, user_message=user_message, history=history, model=openrouter_model)
        first = next(gen)
        meta["provider"] = OPENROUTER
        meta["model"] = (openrouter_model or settings.openrouter_model)
        yield first
        yield from gen
    except StopIteration:
        return
    except openrouter.OpenRouterUnavailable as e:
        raise LLMUnavailable(f"The assistant is unavailable: {e}") from e
    except openrouter.OpenRouterError as e:
        raise LLMError(str(e)) from e


def list_models() -> ModelsInfo:
    """Models offered by whichever provider is currently serving requests."""
    try:
        available = ollama.list_models()
        return ModelsInfo(current=settings.ollama_model, available=available, provider=OLLAMA)
    except ollama.OllamaUnavailable as unavailable:
        if not openrouter.is_configured():
            raise LLMUnavailable(str(unavailable)) from unavailable
        logger.info("Ollama unavailable (%s) — listing OpenRouter models", unavailable)
    except ollama.OllamaError as e:
        raise LLMError(str(e)) from e

    try:
        available = openrouter.list_models()
    except openrouter.OpenRouterUnavailable as e:
        raise LLMUnavailable(f"The assistant is unavailable: {e}") from e
    except openrouter.OpenRouterError as e:
        raise LLMError(str(e)) from e
    return ModelsInfo(
        current=settings.openrouter_model, available=available, provider=OPENROUTER
    )
