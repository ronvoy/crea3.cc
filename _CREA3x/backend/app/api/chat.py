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
import httpx

from .deps import get_current_user
from ..models import User
from ..core.config import settings

router = APIRouter(prefix="/api/chat", tags=["legal-ai"])


class ChatIn(BaseModel):
    question: str
    lang: str | None = None


class ChatOut(BaseModel):
    answer: str
    source: str = "legal-ai"


@router.post("", response_model=ChatOut)
def legal_ai_chat(payload: ChatIn, user: User = Depends(get_current_user)) -> ChatOut:
    q = (payload.question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty question")

    upstream = (settings.legal_ai_url or "").strip()
    if not upstream:
        raise HTTPException(
            status_code=503,
            detail="The Legal AI service is not configured (set LEGAL_AI_URL).",
        )

    # Forward the question and (optionally) the UI language so the upstream RAG
    # service can answer in the user's language if it supports it.
    body: dict = {"question": q}
    if payload.lang:
        body["lang"] = payload.lang

    try:
        with httpx.Client(timeout=settings.legal_ai_timeout_seconds) as client:
            res = client.post(upstream, json=body)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Legal AI service unreachable: {type(e).__name__}")

    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Legal AI service error ({res.status_code}).")

    data = res.json() if res.content else {}
    answer = data.get("answer") or data.get("reply") or data.get("response") or data.get("message")
    if not answer:
        raise HTTPException(status_code=502, detail="Legal AI service returned an empty answer.")
    return ChatOut(answer=str(answer))
