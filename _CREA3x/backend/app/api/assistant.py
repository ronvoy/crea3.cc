"""Locally-hosted 'Workflow Assistant' (powered by Ollama).

Unlike the external Legal AI proxy (chat.py), this assistant:
  * runs entirely on a local Ollama model (swappable via OLLAMA_MODEL or per
    request via the `model` field),
  * answers questions about HOW TO USE the platform (built-in FAQ / instructions),
  * can be scoped to a specific dispute, in which case the caller's own live
    workflow data (status, goods, agents, their own preferences/strategy) is
    injected as grounding context so the user can ask things like "what should I
    put in the entitlement share field?" or "what's left for me to do on this
    dispute?".

Access control: the dispute-scoped endpoint enforces the same access rules as
the rest of the API (admin/owner/participant only), and a participant only ever
sees their OWN preferences/strategy in the context — never another party's.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .deps import get_current_user
from ..db import get_session
from ..models import Dispute, DisputeAgent, Good, Preference, Strategy, User
from ..core import ollama
from ..core.authz import require_access, get_participant, participant_is_mediator

router = APIRouter(prefix="/api/assistant", tags=["workflow-assistant"])


# --------------------------------------------------------------------------
# Knowledge base: how the platform works. Kept here (not in the model) so it can
# be edited without code changes elsewhere, and injected into the system prompt.
# --------------------------------------------------------------------------
PLATFORM_GUIDE = """\
CREA3 is a platform to resolve civil disputes (typically division of assets in
divorce or inheritance) through a structured, transparent negotiation workflow.

WORKFLOW STAGES (in order):
1. Create dispute: the owner gives it a title and a resolution method.
2. Agents: the owner invites the parties by email, each with an "entitlement
   share" (their rightful proportion, a number between 0 and 1). The shares of
   all parties must sum to 1.0 before the dispute can be validated.
3. Goods: the owner (or a joined party) lists the assets in dispute. Each good
   has a name, an estimated value, and a flag for whether it is indivisible.
4. Preferences: each party rates every good from 1 to 5 stars to express how
   much they want it.
5. Strategy / Notes: each party may write private notes visible only to the
   mediator.
6. Ready & Validation: once everyone has rated all goods and is marked ready,
   the dispute moves to validation.
7. Proposal: the system produces a suggested allocation of goods to parties.
   Each party accepts or declines it.
8. Mediation: if declined, parties schedule a video mediation session.
9. Report: when accepted, a final PDF report is generated.

FIELD HELP:
- Entitlement share: a decimal from 0 to 1 (e.g. 0.5 = half). All parties' shares
  must total 1.0.
- Estimated value: the monetary value of the good, used to measure fairness.
- Indivisible: tick this if the good cannot be split (e.g. a car).
- Stars (preferences): 1 = don't care, 5 = want it most.

ROLES:
- The dispute owner manages agents and goods and generates proposals.
- A mediator can only view; they cannot submit preferences or proposals.

Answer ONLY using the information above and the dispute context provided. If a
question is a legal question (about the law itself, rights, or statutes), do NOT
answer it: tell the user to use the separate "Legal AI Assistant" page instead.
Keep answers short, clear, and practical. If you don't know, say so.
"""


class AssistantTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class AssistantIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[AssistantTurn] = Field(default_factory=list)
    model: str | None = Field(default=None, max_length=120)
    lang: str | None = Field(default=None, max_length=8)


class AssistantOut(BaseModel):
    answer: str
    model: str
    grounded_on_dispute: int | None = None


class ModelsOut(BaseModel):
    current: str
    available: list[str]


def _history_payload(history: list[AssistantTurn]) -> list[dict[str, str]]:
    # Cap to the last 8 turns to keep the prompt small for small local models.
    return [{"role": t.role, "content": t.content} for t in history[-8:]]


# Map the UI language code to a language name the model will understand.
_LANG_NAMES = {
    "en": "English",
    "it": "Italian",
    "sl": "Slovenian",
    "et": "Estonian",
    "be": "French (Belgium)",
    "lt": "Lithuanian",
    "hr": "Croatian",
}


def _lang_instruction(lang: str | None) -> str:
    name = _LANG_NAMES.get((lang or "").lower())
    if not name:
        return ""
    return f"\n\nIMPORTANT: Always reply in {name}."


@router.get("/models", response_model=ModelsOut)
def list_models(_user: User = Depends(get_current_user)):
    """List models installed on the local Ollama server (for the model picker)."""
    from ..core.config import settings
    try:
        available = ollama.list_models()
    except ollama.OllamaUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ollama.OllamaError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return ModelsOut(current=settings.ollama_model, available=available)


class PublicAssistantIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[AssistantTurn] = Field(default_factory=list)
    lang: str | None = Field(default=None, max_length=8)


PUBLIC_GUIDE = (
    PLATFORM_GUIDE
    + """

You are also greeting VISITORS who are NOT logged in yet, on the public landing and
registration pages. Be welcoming and concise. Help them understand what CREA3 is and
how to get started:
- To create an account: choose "Create an account", enter a username, email and a
  password (at least 8 characters). A verification email is then sent — open its link
  to activate the account, then sign in.
- To sign in: choose "Sign in" and use the email and password of a verified account.
- Registration and sign-in happen inside the platform (there is no external page).
- If they forget to verify, sign-in will remind them to open the verification email.
Do not answer legal questions; explain that a dedicated Legal AI Assistant is available
after signing in.
"""
)


@router.post("/public", response_model=AssistantOut)
def assistant_public(payload: PublicAssistantIn):
    """Anonymous assistant for the landing/registration pages (no auth).

    Answers general questions about the project and how to register / sign in.
    """
    from ..core.config import settings
    try:
        answer = ollama.chat(
            system=PUBLIC_GUIDE + _lang_instruction(payload.lang),
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=None,
        )
    except ollama.OllamaUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ollama.OllamaError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return AssistantOut(answer=answer, model=settings.ollama_model)


@router.post("", response_model=AssistantOut)
def assistant_general(payload: AssistantIn, _user: User = Depends(get_current_user)):
    """General how-to-use-the-platform assistant (no dispute context)."""
    from ..core.config import settings
    try:
        answer = ollama.chat(
            system=PLATFORM_GUIDE + _lang_instruction(payload.lang),
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=payload.model,
        )
    except ollama.OllamaUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ollama.OllamaError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return AssistantOut(answer=answer, model=(payload.model or settings.ollama_model))


@router.post("/disputes/{dispute_id}", response_model=AssistantOut)
def assistant_for_dispute(
    dispute_id: int,
    payload: AssistantIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Workflow assistant scoped to one dispute, grounded on its live data.

    Only the caller's OWN preferences/strategy are included in the context.
    """
    from ..core.config import settings

    dispute = require_access(session, dispute_id, user)
    participant = get_participant(session, dispute_id, user)

    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all()

    # Build a compact, privacy-respecting context block.
    lines: list[str] = []
    lines.append(f"Dispute #{dispute.id}: \"{dispute.title}\"")
    lines.append(f"Current stage/status: {dispute.status}")
    lines.append(f"Resolution method: {dispute.method}")
    lines.append("")
    lines.append(f"Parties ({len(agents)}):")
    for a in agents:
        lines.append(
            f"  - {a.name} (role: {a.role_in_dispute or 'agent'}, "
            f"entitlement share: {a.entitlement_share}, status: {a.invite_status})"
        )
    total_share = sum(
        float(a.entitlement_share or 0.0)
        for a in agents
        if (a.role_in_dispute or "agent").lower() != "mediator"
    )
    lines.append(f"  (sum of non-mediator shares: {round(total_share, 4)}; must equal 1.0 to validate)")
    lines.append("")
    lines.append(f"Goods ({len(goods)}):")
    for g in goods:
        lines.append(
            f"  - {g.name} (estimated value: {g.estimated_value}, "
            f"indivisible: {g.indivisible})"
        )

    # The caller's own preferences/strategy ONLY (never another party's).
    if participant and not participant_is_mediator(user, participant):
        my_prefs = session.exec(
            select(Preference).where(
                Preference.dispute_id == dispute_id,
                Preference.agent_id == participant.id,
            )
        ).all()
        rated = {p.good_id: p.stars for p in my_prefs if p.stars is not None}
        goods_by_id = {g.id: g.name for g in goods}
        lines.append("")
        lines.append("Your own ratings so far:")
        if rated:
            for gid, stars in rated.items():
                lines.append(f"  - {goods_by_id.get(gid, f'good {gid}')}: {stars} stars")
        else:
            lines.append("  (you have not rated any goods yet)")
        unrated = [goods_by_id.get(g.id, f"good {g.id}") for g in goods if g.id not in rated]
        if unrated:
            lines.append(f"  Goods you still need to rate: {', '.join(unrated)}")

        my_strategy = session.exec(
            select(Strategy).where(
                Strategy.dispute_id == dispute_id,
                Strategy.agent_id == participant.id,
            )
        ).first()
        lines.append(f"Your strategy note: {'set' if (my_strategy and my_strategy.text) else 'empty'}")

    context = "\n".join(lines)
    system = (
        PLATFORM_GUIDE
        + "\n\nHere is the live data for the dispute the user is currently viewing. "
        "Use it to answer questions about THIS dispute:\n\n"
        + context
        + _lang_instruction(payload.lang)
    )

    try:
        answer = ollama.chat(
            system=system,
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=payload.model,
        )
    except ollama.OllamaUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ollama.OllamaError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return AssistantOut(
        answer=answer,
        model=(payload.model or settings.ollama_model),
        grounded_on_dispute=dispute_id,
    )
