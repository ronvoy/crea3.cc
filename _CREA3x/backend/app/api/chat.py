"""External 'Legal AI Assistant' proxy.

This proxies the conversational RAG service that is hosted OUTSIDE this codebase.
Key fixes vs. the previous version:
  * The upstream URL is read from server config (LEGAL_AI_URL), not hardcoded in
    the frontend, so it can be changed per environment and is not exposed.
  * The endpoint requires an authenticated user (the previous frontend call sent
    no token at all).
  * Errors are surfaced cleanly instead of silently swallowed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import logging

import httpx

from .deps import get_current_user
from ..models import User
from ..core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["legal-ai"])


class ChatIn(BaseModel):
    question: str
    lang: str | None = None


class ChatOut(BaseModel):
    answer: str
    source: str = "legal-ai"
    # True when the answer came from the external secondary model instead of the
    # platform's own LexAI service — the UI renders the "external model" chip.
    fallback: bool = False


@router.post("", response_model=ChatOut)
def legal_ai_chat(payload: ChatIn, user: User = Depends(get_current_user)) -> ChatOut:
    q = (payload.question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty question")

    upstream = (settings.legal_ai_url or "").strip()

    def _secondary(reason: str) -> ChatOut:
        """Answer with the external model when LexAI cannot serve the request.

        A missing/unreachable/erroring chatbot used to surface as a bare 502;
        the platform now degrades to the secondary provider and flags it so the
        interface can show the external-model chip.
        """
        logger.info("legal-ai chat falling back to the external model: %s", reason)
        from ..core import llm
        result = llm.chat(
            system=(
                "You are the CREA3 Legal AI assistant. Answer the user's question about European "
                "family-law and asset-division matters clearly and concisely, in Markdown. Say when "
                "something depends on national law or would need a lawyer's review."
                + (f"\nReply in this language: {payload.lang}." if payload.lang else "")
            ),
            user_message=q,
            openrouter_model=settings.legal_openrouter_model,
        )
        if not (result.text or "").strip():
            raise HTTPException(status_code=502, detail="The assistant returned an empty answer.")
        return ChatOut(answer=result.text, source=result.provider,
                       fallback=result.provider != llm.LEGAL_AI)

    if not upstream:
        return _secondary("LEGAL_AI_URL is not configured")

    # Forward the question and (optionally) the UI language so the upstream RAG
    # service can answer in the user's language if it supports it.
    body: dict = {"question": q}
    if payload.lang:
        body["lang"] = payload.lang

    try:
        with httpx.Client(timeout=settings.legal_ai_timeout_seconds) as client:
            res = client.post(upstream, json=body)
    except httpx.RequestError as e:
        return _secondary(f"unreachable: {type(e).__name__}")

    if res.status_code >= 400:
        return _secondary(f"upstream HTTP {res.status_code}")

    data = res.json() if res.content else {}
    answer = data.get("answer") or data.get("reply") or data.get("response") or data.get("message")
    if not answer or not str(answer).strip():
        return _secondary("empty answer from LexAI")
    return ChatOut(answer=str(answer))
