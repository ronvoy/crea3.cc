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
from ..core import llm
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
        info = llm.list_models()
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return ModelsOut(current=info.current, available=info.available)


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
        result = llm.chat(
            system=PUBLIC_GUIDE + _lang_instruction(payload.lang),
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=None,
        )
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return AssistantOut(answer=result.text, model=result.model)


LEGAL_GUIDE = """\
You are the "Legal AI Assistant" for CREA3, a platform that helps families resolve
civil disputes (division of assets in divorce or inheritance) across six European
jurisdictions: Italy, Slovenia, Estonia, Belgium, Lithuania and Croatia.

Your role: answer the user's LEGAL questions about family law, asset division,
inheritance, mediation and related rights in these jurisdictions. Be clear,
concise and practical. When the answer depends on which country's law applies,
say so and, if the user has not told you, ask which jurisdiction they mean.

IMPORTANT LIMITS:
- You are an AI assistant, NOT a lawyer. Always make clear that this is general
  information, may be incomplete or wrong, and does not replace advice from a
  qualified professional. Encourage consulting a lawyer or mediator for their
  specific case.
- Do not invent statutes, article numbers or case citations you are not sure of;
  if you are unsure, say so plainly rather than guessing.
- For questions about HOW TO USE the platform (filling fields, running the
  workflow), tell the user to switch to the "Workflow" tab of this assistant.
"""


@router.post("/legal", response_model=AssistantOut)
def assistant_legal(payload: AssistantIn, _user: User = Depends(get_current_user)):
    """Legal AI Assistant — general legal Q&A for the six jurisdictions.

    Tries the local Ollama model first and falls back to OpenRouter PINNED to
    Mistral (settings.legal_openrouter_model) when Ollama is unreachable.
    """
    from ..core.config import settings
    try:
        result = llm.chat(
            system=LEGAL_GUIDE + _lang_instruction(payload.lang),
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=payload.model,
            openrouter_model=settings.legal_openrouter_model,
        )
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return AssistantOut(answer=result.text, model=result.model)


@router.post("", response_model=AssistantOut)
def assistant_general(payload: AssistantIn, _user: User = Depends(get_current_user)):
    """General how-to-use-the-platform assistant (no dispute context)."""
    from ..core.config import settings
    try:
        result = llm.chat(
            system=PLATFORM_GUIDE + _lang_instruction(payload.lang),
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=payload.model,
        )
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return AssistantOut(answer=result.text, model=result.model)


def _dispute_context_block(session: Session, dispute_id: int, user: User) -> str:
    """Compact, privacy-respecting live-data block for one dispute.

    Enforces access (raises if the caller may not see the dispute) and includes
    ONLY the caller's own preferences/strategy — never another party's.
    """
    dispute = require_access(session, dispute_id, user)
    participant = get_participant(session, dispute_id, user)

    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all()

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

    return "\n".join(lines)


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

    context = _dispute_context_block(session, dispute_id, user)
    system = (
        PLATFORM_GUIDE
        + "\n\nHere is the live data for the dispute the user is currently viewing. "
        "Use it to answer questions about THIS dispute:\n\n"
        + context
        + _lang_instruction(payload.lang)
    )

    try:
        result = llm.chat(
            system=system,
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=payload.model,
        )
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return AssistantOut(
        answer=result.text,
        model=result.model,
        grounded_on_dispute=dispute_id,
    )


# ==========================================================================
# Unified, classifier-routed assistant (single chatbot; three intents).
#
# The chatbot no longer has separate Workflow / Legal tabs. Every question is
# first classified into one of three intents by a top-layer wrapper prompt and
# then answered with an intent-specific system prompt. All requests use the
# primary LLM endpoint (Ollama-native) first and only fall back to OpenRouter
# (pinned to Mistral) when the primary is empty/unreachable/erroring — this
# happens inside core.llm.chat.
#
# Knowledge-base (RAG) grounding for `workflow`/`legal_statutes` and GDPR-masked
# `past_cases` retrieval are layered on in later steps; here the intents route to
# their base prompts.
# ==========================================================================

INTENTS = ("workflow", "past_cases", "legal_statutes")

PAST_CASES_GUIDE = """\
You are the "Past Legal Dispute Cases" assistant for CREA3. The user wants to
know about disputes similar to their own (people involved, context, procedure,
hearings and outcome). Answer helpfully and practically.

STRICT PRIVACY (EU GDPR): never reveal the real identity or personal data of any
party in any past case. Refer to parties generically ("Party A", "Party B", "the
claimant") and never output names, emails, phone numbers or addresses. If the
user asks for someone's personal details, refuse and explain the privacy rule.

You are an AI assistant, not a lawyer: note that this is general information and
does not replace professional advice.
"""

_CLASSIFY_SYSTEM = """\
You are a strict router for the CREA3 assistant. Read the user's latest message
and classify it into EXACTLY ONE of these labels:

- workflow: about USING the CREA3 platform, its process/steps, or the user's own
  dispute data (how to fill a field, what to do next, status of my case).
- past_cases: asking about SIMILAR or PAST dispute cases / precedents / how other
  comparable disputes went or were resolved.
- legal_statutes: a country-specific LEGAL question about the law, statutes,
  rights, regulations or legal procedure itself.

Reply with ONLY the single label word (workflow, past_cases or legal_statutes).
No punctuation, no explanation.
"""


def _heuristic_intent(question: str) -> str:
    q = (question or "").lower()
    past_kw = ("similar case", "past case", "previous case", "precedent",
               "other dispute", "other cases", "case like", "cases like",
               "how did", "resolved before", "outcome of")
    legal_kw = ("law", "legal", "statute", "article", "regulation", "gdpr",
                "court", "jurisdiction", "rights", "inherit", "divorce law",
                "entitled by law", "sentence", "ruling")
    if any(k in q for k in past_kw):
        return "past_cases"
    if any(k in q for k in legal_kw):
        return "legal_statutes"
    return "workflow"


def classify_intent(question: str, history: list[AssistantTurn] | None = None) -> str:
    """Route a question to one of INTENTS via a cheap LLM call (primary→Mistral).

    Falls back to a keyword heuristic if the label can't be parsed or no provider
    is reachable, so classification never hard-fails.
    """
    from ..core.config import settings
    try:
        result = llm.chat(
            system=_CLASSIFY_SYSTEM,
            user_message=question,
            history=_history_payload(history or []),
            openrouter_model=settings.legal_openrouter_model,
        )
        label = (result.text or "").strip().lower()
        for intent in INTENTS:
            if intent in label:
                return intent
    except (llm.LLMUnavailable, llm.LLMError):
        pass
    return _heuristic_intent(question)


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[AssistantTurn] = Field(default_factory=list)
    model: str | None = Field(default=None, max_length=120)
    lang: str | None = Field(default=None, max_length=8)
    dispute_id: int | None = Field(default=None)
    # "auto" classifies; any INTENTS value pins the route (manual override).
    mode: str = Field(default="auto", max_length=20)
    # Only meaningful for past_cases answers.
    format: str = Field(default="descriptive", pattern="^(descriptive|tabular)$")


class AskOut(BaseModel):
    answer: str
    model: str
    intent: str
    provider: str
    grounded_on_dispute: int | None = None
    sources: list[str] = Field(default_factory=list)


def _kb_grounding(session: Session, section: str, question: str) -> tuple[str, list[str]]:
    """Retrieve top KB chunks for a section and format them as grounding context.

    Returns (context_block, source_filenames). Empty when the section has no
    matching documents — the caller then answers from the model's own knowledge.
    """
    try:
        from ..core import knowledge
        chunks = knowledge.retrieve(session, section, question)
    except Exception:  # never let retrieval break the chat
        chunks = []
    if not chunks:
        return "", []
    blocks, sources = [], []
    for i, ch in enumerate(chunks, 1):
        fn = ch.get("filename", "document")
        blocks.append(f"[{i}] (source: {fn})\n{ch.get('text', '')}")
        if fn not in sources:
            sources.append(fn)
    context = (
        "\n\nReference excerpts from the CREA3 knowledge base. Prefer these when "
        "answering and cite the source filename you used. If they do not contain "
        "the answer, say so briefly and then answer from your general knowledge:\n\n"
        + "\n\n".join(blocks)
    )
    return context, sources


def _system_for_intent(
    intent: str,
    payload: AskIn,
    user: User,
    session: Session,
) -> tuple[str, int | None, list[str]]:
    """Build the intent-specific system prompt.

    Returns (system, grounded_dispute, kb_sources). Workflow and legal_statutes
    are grounded on the Knowledge Base; masked past-case retrieval is added in
    the next step.
    """
    grounded: int | None = None
    sources: list[str] = []
    if intent == "legal_statutes":
        system = LEGAL_GUIDE
        ctx, sources = _kb_grounding(session, "legal_statutes", payload.question)
        system += ctx
    elif intent == "past_cases":
        system = PAST_CASES_GUIDE
        if payload.format == "tabular":
            system += (
                "\n\nWhen presenting cases, format them as a compact Markdown TABLE "
                "with columns: Parties | Context | Procedure | Hearing | Outcome."
            )
        else:
            system += "\n\nPresent each relevant case as a short descriptive paragraph."
    else:  # workflow
        system = PLATFORM_GUIDE
        ctx, sources = _kb_grounding(session, "workflow", payload.question)
        system += ctx
        if payload.dispute_id is not None:
            try:
                context = _dispute_context_block(session, payload.dispute_id, user)
                system += (
                    "\n\nHere is the live data for the dispute the user is currently "
                    "viewing. Use it to answer questions about THIS dispute:\n\n" + context
                )
                grounded = payload.dispute_id
            except HTTPException:
                # No access / not found — answer generally rather than leaking.
                pass
    return system + _lang_instruction(payload.lang), grounded, sources


@router.post("/ask", response_model=AskOut)
def assistant_ask(
    payload: AskIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Single entry point for the unified chatbot: classify → route → answer."""
    from ..core.config import settings

    intent = payload.mode if payload.mode in INTENTS else classify_intent(payload.question, payload.history)
    system, grounded, sources = _system_for_intent(intent, payload, user, session)

    try:
        result = llm.chat(
            system=system,
            user_message=payload.question,
            history=_history_payload(payload.history),
            model=payload.model,
            openrouter_model=settings.legal_openrouter_model,
        )
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return AskOut(
        answer=result.text,
        model=result.model,
        intent=intent,
        provider=result.provider,
        grounded_on_dispute=grounded,
        sources=sources,
    )
