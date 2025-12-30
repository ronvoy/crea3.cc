from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx

from .deps import get_current_user
from ..models import User
from ..core.config import settings

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatIn(BaseModel):
    question: str


class ChatOut(BaseModel):
    answer: str
    upstream: str | None = None


_FAQ = [
    ("what is a dispute", "A dispute on CREA3 is a structured legal procedure to resolve conflicts over division. The platform uses AI tools and game-theoretical algorithms to help parties reach a fair, efficient resolution."),
    ("bids", "Bids method: users distribute virtual money across goods to express preferences."),
    ("rates", "Rates method: users rate each good on a 1–5 scale to express importance."),
    ("invite", "Open your dispute → Agents → Add New Agent. Enter name, email, entitlement share and optional role. They will see a notification when they log in."),
    ("add goods", "Open your dispute → Goods → Add New Good. Enter name, estimated value, and optionally mark as indivisible."),
    ("preferences", "Agent preferences reflect how each agent values goods, entered via Bids or Rates based on the dispute configuration."),
    ("proposal", "Once preferences are submitted, the system proposes an allocation which parties can accept or decline. If declined, mediation can be scheduled via videoconference."),
    ("report", "When all parties accept, CREA3 finalizes the case and generates a downloadable report."),
]


def _local_answer(q: str) -> str | None:
    ql = q.lower().strip()
    for key, ans in _FAQ:
        if key in ql:
            return ans
    return None


@router.post("", response_model=ChatOut)
def chat(payload: ChatIn, user: User = Depends(get_current_user)):
    q = (payload.question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty question")

    # Prefer upstream if configured
    upstream = (settings.chat_upstream_url or "").strip()
    if upstream:
        try:
            with httpx.Client(timeout=20.0) as client:
                res = client.post(upstream, json={"question": q})
            if res.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Upstream error ({res.status_code})")
            data = res.json() if res.content else {}
            answer = data.get("answer") or data.get("reply") or data.get("response") or data.get("message")
            if answer:
                return ChatOut(answer=str(answer), upstream=upstream)
        except HTTPException:
            raise
        except Exception:
            # fall back to local
            pass

    answer = _local_answer(q) or "I can help explain the dispute flow (bids/rates), inviting agents, preferences and what to do next. Ask me about any step."
    return ChatOut(answer=answer, upstream=None)
