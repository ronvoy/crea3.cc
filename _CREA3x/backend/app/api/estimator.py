from __future__ import annotations

"""'AI Estimate' — a per-good market-valuation assistant.

Each Good in a dispute gets its own small conversation, stored in the
`estimator_chatbot` table. The assistant estimates what the asset is worth on
the open market given its condition, and — crucially — ASKS for the details it
needs when the description is too thin to price (a car without a model/year/
mileage cannot be valued honestly).

Model routing mirrors the Legal AI assistant:
  1. PRIMARY   — the platform's own LexAI service (knowledge base grounded),
  2. SECONDARY — OpenRouter, when LexAI is unreachable; answers produced this
     way are flagged `fallback=True` so the UI can show the external-model chip.

When neither source knows current price levels, a live web lookup
(core.web_search) adds fresh market snippets to the prompt.
"""

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..core import fx
from ..core import legal_ai as _la
from ..core import llm
from ..core import web_search
from ..core.config import settings
from ..db import get_session
from ..models import Dispute, DisputeAgent, EstimatorChat, Good, User
from .deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/disputes", tags=["estimator"])

MAX_TURNS = 40


# ── asset-category playbooks ─────────────────────────────────────────────────
# What the assistant must know before it can price each kind of asset. The
# model is told to ask for whatever is still missing, one short batch at a time.
CATEGORY_QUESTIONS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "vehicle": (
        ("car", "auto", "vehicle", "van", "truck", "motorbike", "motorcycle", "scooter",
         "macchina", "veicolo", "moto"),
        ("make and model", "year of registration", "kilometres travelled", "fuel type and gearbox",
         "service history, damage or defects", "country/region where it would be sold"),
    ),
    "real_estate": (
        ("house", "flat", "apartment", "land", "plot", "villa", "property", "garage", "farm",
         "casa", "appartamento", "terreno", "immobile"),
        ("full location (town and district)", "size in square metres",
         "number of rooms/bedrooms and bathrooms", "floor and whether there is a lift (for flats)",
         "year built and renovation state", "road access and width, parking",
         "energy class if known"),
    ),
    "securities": (
        ("stock", "share", "equity", "bond", "fund", "etf", "crypto", "azioni", "titoli",
         "obbligazioni"),
        ("exact instrument name or ticker", "quantity held", "currency and market of listing",
         "purchase date/price if relevant"),
    ),
    "jewellery": (
        ("jewel", "jewellery", "ring", "necklace", "watch", "gold", "silver", "diamond",
         "gioiello", "anello", "orologio", "oro"),
        ("material and purity (e.g. 18k gold)", "weight in grams",
         "gemstones and their size/quality", "brand and model",
         "age, certificates and condition"),
    ),
    "furniture_art": (
        ("furniture", "sofa", "table", "painting", "artwork", "antique", "piano", "carpet",
         "mobili", "quadro", "arte", "antiquariato"),
        ("maker/designer or artist", "period or year", "dimensions and materials",
         "provenance or certificate", "condition and any restoration"),
    ),
    "electronics": (
        ("laptop", "notebook", "macbook", "imac", "ipad", "tablet", "computer", "pc", "desktop",
         "phone", "iphone", "smartphone", "tv", "television", "monitor", "camera", "console",
         "playstation", "xbox", "appliance", "fridge", "washing machine", "dishwasher",
         "telefono", "elettrodomestico", "frigorifero", "lavatrice"),
        ("brand, exact model and storage/spec", "purchase year",
         "condition, battery health, accessories",
         "whether the original box and warranty are present"),
    ),
    "business": (
        ("business", "company", "shares in", "firm", "shop", "licence", "azienda", "società"),
        ("sector and what the business does",
         "annual turnover and profit for the last 2-3 years",
         "assets and liabilities", "size of the stake being valued"),
    ),
}


def _category(text: str) -> tuple[str, tuple[str, ...]]:
    low = (text or "").lower()
    for name, (words, questions) in CATEGORY_QUESTIONS.items():
        if any(w in low for w in words):
            return name, questions
    return "generic", (
        "what exactly the item is (type, brand/maker, model)",
        "age or year acquired",
        "condition and any damage",
        "size/quantity and any documentation",
        "where it would realistically be sold",
    )


# The model appends compact JSON trailers so the UI can offer one-click actions
# (apply this price / apply this name+description). They are stripped from the
# text the user sees and stored as structured data on the row.
#
# Models decorate the label in practice ("**ESTIMATE_SUMMARY:**", a code fence,
# a newline before the object), and a long answer can be cut off mid-JSON, so
# the parser is deliberately forgiving on both counts.
def _tag_re(tag: str) -> re.Pattern:
    return re.compile(r"[*`_\s]*" + tag + r"[*`_\s]*:?[*`_\s]*(?:```(?:json)?)?\s*(\{.*)", re.S)


_ESTIMATE_RE = _tag_re("ESTIMATE_SUMMARY")
_DETAILS_RE = _tag_re("DETAILS_SUMMARY")


def _first_json(blob: str) -> dict | None:
    """Parse the first JSON object in `blob`, repairing a truncated tail.

    A reply that runs into the token limit can end mid-object; rather than lose
    the whole summary we close the dangling string/braces and parse that.
    """
    if not blob:
        return None
    depth, in_str, esc, end = 0, False, False, -1
    for i, ch in enumerate(blob):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    candidate = blob[:end] if end > 0 else blob.rstrip()
    for attempt in (candidate, candidate + ('"' if in_str else "") + "}" * max(0, depth)):
        try:
            out = json.loads(attempt)
            if isinstance(out, dict):
                return out
        except Exception:
            continue
    return None


def _plain(text: str) -> str:
    """Strip Markdown decoration — the suggested name/description must be plain
    text that can drop straight into an input field."""
    out = re.sub(r"\*\*(.+?)\*\*", r"\1", text or "")
    out = re.sub(r"(?<!\w)[*_`]{1,3}(?=\S)|(?<=\S)[*_`]{1,3}(?!\w)", "", out)
    out = re.sub(r"^[\s>#-]*[-•*]\s+", "", out, flags=re.M)
    out = re.sub(r"\s*\n+\s*", ", ", out)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"(,\s*){2,}", ", ", out)
    return out.strip().strip(",").strip()


def _cut_trailer(text: str, tag: str) -> str:
    """Remove the trailer (from the start of its line) from the visible text."""
    idx = text.find(tag)
    if idx < 0:
        return text
    line_start = text.rfind("\n", 0, idx) + 1
    return text[:line_start].rstrip()


def _extract_blocks(text: str) -> tuple[str, dict | None, dict | None]:
    """Pull the JSON trailers out of a reply; return (clean_text, estimate, details)."""
    estimate = details = None
    text = text or ""

    m = _ESTIMATE_RE.search(text)
    if m:
        raw = _first_json(m.group(1)) or {}
        lo, mid, hi = raw.get("min"), raw.get("avg", raw.get("likely")), raw.get("max")
        vals = [float(v) for v in (lo, mid, hi) if isinstance(v, (int, float))]
        if vals:
            estimate = {
                "min": float(lo) if isinstance(lo, (int, float)) else min(vals),
                "avg": float(mid) if isinstance(mid, (int, float)) else sum(vals) / len(vals),
                "max": float(hi) if isinstance(hi, (int, float)) else max(vals),
                "currency": str(raw.get("currency") or "EUR").upper()[:3],
            }
        text = _cut_trailer(text, "ESTIMATE_SUMMARY")

    m2 = _DETAILS_RE.search(text)
    if m2:
        raw2 = _first_json(m2.group(1)) or {}
        title = _plain(str(raw2.get("title") or ""))[:200]
        desc = _plain(str(raw2.get("description") or ""))[:2000]
        if title or desc:
            details = {"title": title, "description": desc}
        text = _cut_trailer(text, "DETAILS_SUMMARY")

    return text.strip(), estimate, details


def _guard(session: Session, dispute_id: int, good_id: int, user: User) -> Good:
    """The good must exist in this dispute and the caller must be a party to it."""
    good = session.get(Good, good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")
    member = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id, DisputeAgent.user_id == user.id
        )
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a party to this dispute.")
    return good


def _party_countries(session: Session, dispute_id: int) -> set[str]:
    """Registered countries of the dispute's parties — the relevant market."""
    out: set[str] = set()
    try:
        d = session.get(Dispute, dispute_id)
        emails = {a.email for a in session.exec(
            select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all() if a.email}
        users = [session.exec(select(User).where(User.email == e)).first() for e in emails]
        if d and d.created_by_id:
            users.append(session.get(User, d.created_by_id))
        for u in users:
            raw = (getattr(u, "country", "") or "").strip()
            if raw:
                out.add(raw.upper() if len(raw) <= 3 else raw.title())
    except Exception:
        logger.info("estimator: party country lookup failed", exc_info=True)
    return out


def _asset_brief(session: Session, good: Good) -> str:
    """Everything the platform already knows about the asset."""
    meta = good.meta or {}
    currency = str(meta.get("currency") or "EUR").upper()[:3]
    bits = [f"Asset name: {good.name}"]
    desc = (meta.get("description") or "").strip()
    if desc:
        bits.append(f"Description given by the party: {desc}")
    if good.estimated_value:
        bits.append(f"Value entered on the platform: {currency} {float(good.estimated_value):,.2f}")
    bits.append(f"Price in this currency: {currency}")
    bits.append(f"Marked as: {'divisible' if good.divisible else 'indivisible'}")
    countries = _party_countries(session, good.dispute_id)
    if countries:
        bits.append(f"Market to price in (parties' countries): {', '.join(sorted(countries))}")
    return "\n".join(bits)


def _system_prompt(good: Good, brief: str, lang: str, currency: str = "") -> str:
    name, questions = _category(f"{good.name} {(good.meta or {}).get('description', '') or ''}")
    q_list = "\n".join(f"  - {q}" for q in questions)
    return (
        "You are the CREA3 ASSET VALUATION assistant. Your ONLY subject is what a specific asset is "
        "worth on the open market, and how its condition changes that figure. You do not answer legal, "
        "procedural or platform questions — if asked, say the Legal AI assistant handles those.\n\n"
        f"THE ASSET UNDER VALUATION (category: {name})\n{brief}\n\n"
        "HOW TO ANSWER\n"
        "1. If the details below are missing and you cannot price the asset honestly without them, ASK for "
        "them FIRST — a short, numbered list of at most 5 concrete questions. Do not invent a number to fill "
        "the gap, and do not ask for something the user already told you.\n"
        f"   Details that matter for this kind of asset:\n{q_list}\n"
        "2. Once you have enough, give: an ESTIMATED MARKET RANGE (low – likely – high), the main "
        "value drivers, what would raise or lower it, and a one-line note on how confident you are.\n"
        "3. Prefer resale/second-hand market values (what it would actually fetch), not replacement cost, "
        "unless the user asks otherwise.\n"
        "4. ANSWER IN SHORT BULLET POINTS — one fact per bullet, no long paragraphs. Keep the whole "
        "reply under about 12 bullets so it can be read at a glance. Never present the figure as a "
        "certified appraisal: it is an indicative estimate to help the parties agree.\n"
        f"5. Reply in this language: {lang or 'en'}.\n"
        + (f"6. Give every figure in {currency.upper()} and use that code in the summary line below.\n"
           if currency else "")
        + "\n"
        "MACHINE-READABLE TRAILERS (the interface reads these — never mention them in prose)\n"
        "• Whenever you give a value range, END the message with exactly one line:\n"
        '  ESTIMATE_SUMMARY: {"min": <number>, "avg": <number>, "max": <number>, "currency": "<ISO code>"}\n'
        "  Use plain numbers (no thousands separators, no currency symbols) for the low, likely and "
        "high figures you just gave. Omit this line entirely when you are only asking questions.\n"
        "• When you are asked to propose a name and description for the asset, END the message with:\n"
        '  DETAILS_SUMMARY: {"title": "<short asset name, max 60 chars>", "description": "<brief specs, PLAIN TEXT separated by commas>"}\n'
        "  Both values must be PLAIN TEXT: no Markdown, no ** bold **, no bullet characters, no line "
        "breaks. The description is a comma-separated spec list, e.g. "
        '"2015 Volkswagen Golf 1.6 TDI, 150000 km, diesel, manual, single owner, full service history, '
        'minor rear bumper scratches".\n'
    )


def _needs_web(question: str, brief: str) -> bool:
    """Live prices help most for market-traded goods and property."""
    cat, _ = _category(f"{brief} {question}")
    return cat in ("vehicle", "real_estate", "securities", "electronics", "jewellery")


class DraftEstimateIn(BaseModel):
    """A quick estimate for an asset still being typed into the Add-good form."""
    name: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=2000)
    currency: str = Field(default="EUR", max_length=3)
    lang: str = Field(default="en", max_length=8)


class EstimateIn(BaseModel):
    message: str = Field(default="", max_length=4000)
    lang: str = Field(default="en", max_length=8)
    # The currency chosen at the top of the goods section: the assistant must
    # price in it, so switching there propagates into this conversation too.
    currency: str = Field(default="", max_length=3)


class SeedIn(BaseModel):
    """A quick estimate made in the Add-good form, carried into the good's thread."""
    question: str = Field(default="", max_length=500)
    text: str = Field(default="", max_length=20000)
    estimate: dict | None = None
    fallback: bool = False
    applied: float | None = None
    currency: str = Field(default="EUR", max_length=3)


class EstimatorReportIn(BaseModel):
    """A user-reported problem with a valuation (wrong figure, bad reasoning…)."""
    title: str = Field(default="", max_length=150)
    note: str = Field(default="", max_length=2000)


def _row_out(r: EstimatorChat) -> dict:
    meta = r.meta or {}
    return {
        "id": r.id, "role": r.role, "text": r.text,
        "fallback": bool(r.fallback),
        "estimate": meta.get("estimate"),      # {min, avg, max, currency}
        "details": meta.get("details"),        # {title, description}
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _generate(system: str, question: str, history: list[dict], lang: str,
              max_tokens: int = 1600) -> tuple[str, bool]:
    """LexAI first, external secondary second. Returns (text, used_fallback)."""
    try:
        if _la.is_configured() and _la.is_reachable():
            convo = "\n\n".join(f"{h['role'].upper()}: {h['content']}" for h in history)
            prompt = (f"{system}\n\n---\n\n{convo}\n\nUSER: {question}" if convo
                      else f"{system}\n\n---\n\nUSER: {question}")
            text = _la.ask(prompt, lang=lang)
            if not (text or "").strip():
                # An empty reply is a failure, not an answer — degrade instead.
                raise _la.LegalAIError("LexAI returned an empty answer")
            return text, False
        raise _la.LegalAIUnavailable("LexAI not reachable")
    except Exception as exc:
        logger.info("estimator: LexAI unavailable (%s) — using the external secondary model", exc)
        try:
            result = llm.chat(system=system, user_message=question, history=history,
                              openrouter_model=settings.legal_openrouter_model,
                              max_tokens=max_tokens)
            return result.text, result.provider != llm.LEGAL_AI
        except Exception as exc2:
            logger.warning("estimator generation failed: %s", exc2)
            raise HTTPException(
                status_code=502,
                detail="Both the platform assistant and the external model are unavailable right now. "
                       "Please try again shortly.",
            )


@router.get("/{dispute_id}/goods/{good_id}/estimate")
def get_estimate_chat(
    dispute_id: int, good_id: int,
    user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    _guard(session, dispute_id, good_id, user)
    rows = session.exec(
        select(EstimatorChat).where(EstimatorChat.good_id == good_id).order_by(EstimatorChat.id)
    ).all()
    return {"messages": [_row_out(r) for r in rows]}


@router.post("/{dispute_id}/goods/{good_id}/estimate")
def post_estimate_chat(
    dispute_id: int, good_id: int, body: EstimateIn,
    user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    """Ask the valuation assistant about this asset (empty message = first estimate)."""
    good = _guard(session, dispute_id, good_id, user)
    brief = _asset_brief(session, good)

    history_rows = session.exec(
        select(EstimatorChat).where(EstimatorChat.good_id == good_id).order_by(EstimatorChat.id)
    ).all()[-MAX_TURNS:]

    question = (body.message or "").strip()
    first_turn = not history_rows
    if not question:
        question = (
            "Estimate the current market value of this asset. If you need more details to price it "
            "properly, ask me for them first."
        )

    if body.message.strip():
        session.add(EstimatorChat(
            good_id=good_id, dispute_id=dispute_id, user_id=user.id,
            role="user", text=body.message.strip()[:4000],
        ))
        session.commit()

    currency = (body.currency or (good.meta or {}).get("currency") or "EUR").upper()[:3]
    system = _system_prompt(good, brief, body.lang, currency)
    if _needs_web(question, brief):
        hits = web_search.search(
            f"{good.name} {(good.meta or {}).get('description', '') or ''} market value price")
        ctx = web_search.as_context(hits)
        if ctx:
            system += "\n\n" + ctx

    history = [{"role": r.role, "content": r.text} for r in history_rows]
    text, used_fallback = _generate(system, question, history, body.lang)

    clean, estimate, details = _extract_blocks(text or "")
    row = EstimatorChat(
        good_id=good_id, dispute_id=dispute_id, user_id=user.id,
        role="assistant", text=clean, fallback=used_fallback,
        meta={"first_turn": first_turn, "estimate": estimate, "details": details},
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _row_out(row)


@router.delete("/{dispute_id}/goods/{good_id}/estimate")
def clear_estimate_chat(
    dispute_id: int, good_id: int,
    user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    _guard(session, dispute_id, good_id, user)
    for r in session.exec(select(EstimatorChat).where(EstimatorChat.good_id == good_id)).all():
        session.delete(r)
    session.commit()
    return {"ok": True}


@router.post("/{dispute_id}/goods/estimate-draft")
def estimate_draft(
    dispute_id: int, body: DraftEstimateIn,
    user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    """One-shot valuation for an asset that does not exist yet.

    Powers the "AI Estimate" button next to the price field while a party is
    still adding the good, so they can fill the amount without saving first.
    Nothing is stored: there is no good to attach a conversation to.
    """
    member = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id, DisputeAgent.user_id == user.id
        )
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a party to this dispute.")
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="Give the asset a name first.")

    currency = (body.currency or "EUR").upper()[:3]
    stub = Good(id=0, dispute_id=dispute_id, name=body.name.strip(),
                estimated_value=0.0, divisible=False, indivisible=True,
                meta={"currency": currency, "description": (body.description or "").strip()})
    countries = _party_countries(session, dispute_id)
    brief = "\n".join([
        f"Asset name: {stub.name}",
        *([f"Description given by the party: {stub.meta['description']}"] if stub.meta["description"] else []),
        f"Price in this currency: {currency}",
        *([f"Market to price in (parties' countries): {', '.join(sorted(countries))}"] if countries else []),
    ])
    system = _system_prompt(stub, brief, body.lang, currency)
    question = (
        "Give your best market estimate for this asset now, using reasonable assumptions for anything "
        "not stated (say briefly which assumptions you made). Keep it to a few lines and always end "
        "with the ESTIMATE_SUMMARY line."
    )
    if _needs_web(question, brief):
        ctx = web_search.as_context(
            web_search.search(f"{stub.name} {stub.meta['description']} market value price"))
        if ctx:
            system += "\n\n" + ctx

    text, used_fallback = _generate(system, question, [], body.lang, max_tokens=900)
    clean, estimate, _details = _extract_blocks(text or "")
    return {"text": clean, "estimate": estimate, "fallback": used_fallback}


@router.post("/{dispute_id}/goods/{good_id}/estimate/seed")
def seed_estimate_chat(
    dispute_id: int, good_id: int, body: SeedIn,
    user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    """Store a quick estimate made while the asset was being added.

    The Add-good form can price an asset before it exists; when the party then
    applies that figure, the question, the reasoning and the structured range
    are written into the new good's AI Estimate thread — so the reason behind
    the number stays with the asset and the conversation can be continued.
    """
    _guard(session, dispute_id, good_id, user)
    if session.exec(select(EstimatorChat).where(EstimatorChat.good_id == good_id)).first():
        return {"ok": True, "seeded": False}       # never duplicate an existing thread

    currency = (body.currency or "EUR").upper()[:3]
    asked = (body.question or "").strip() or (
        f"Quick estimate requested while adding this asset (prices in {currency})."
    )
    session.add(EstimatorChat(
        good_id=good_id, dispute_id=dispute_id, user_id=user.id,
        role="user", text=asked, meta={"seeded": True},
    ))
    note = ""
    if body.applied is not None:
        note = f"\n\n_Applied as this asset's value: {currency} {float(body.applied):,.2f}_"
    session.add(EstimatorChat(
        good_id=good_id, dispute_id=dispute_id, user_id=user.id,
        role="assistant", text=(body.text or "").strip() + note,
        fallback=bool(body.fallback),
        meta={"seeded": True, "estimate": body.estimate, "applied": body.applied,
              "currency": currency},
    ))
    session.commit()
    return {"ok": True, "seeded": True}


@router.get("/{dispute_id}/fx/rates")
def fx_rates(dispute_id: int, user: User = Depends(get_current_user)):
    """Today's reference rates (per EUR) for converting asset values.

    Served from a short-lived server-side cache, so switching the currency in
    the goods section costs nothing after the first call.
    """
    data = fx.get_rates()
    return {"rates": data["rates"], "date": data["date"],
            "source": data["source"], "cached": data["cached"]}


@router.post("/{dispute_id}/goods/{good_id}/estimate/report")
def report_estimate(
    dispute_id: int, good_id: int, body: EstimatorReportIn,
    user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    """Email the whole valuation conversation to support for review.

    Mirrors the Legal AI report: subject carries the reporter and their title,
    the note goes in the body, and the transcript travels as a .txt attachment
    so a long conversation can never break the send.
    """
    from datetime import datetime, timezone as _tz
    from ..core.config import settings as _settings
    from ..core.email import send_email_with_attachments

    good = _guard(session, dispute_id, good_id, user)
    to_email = (_settings.support_email or _settings.smtp_from or "").strip()
    if not to_email:
        raise HTTPException(status_code=503, detail="Support mailbox is not configured.")

    rows = session.exec(
        select(EstimatorChat).where(EstimatorChat.good_id == good_id).order_by(EstimatorChat.id)
    ).all()
    lines = []
    for r in rows:
        who = "User" if r.role == "user" else "AI Estimator"
        if (r.text or "").strip():
            lines.append(f"{who}:\n{r.text.strip()}")
        est = (r.meta or {}).get("estimate")
        if est:
            lines.append(f"[structured estimate] {est}")
    transcript = "\n\n".join(lines) if lines else "(the conversation was empty)"

    rep_title = (body.title or "").strip()
    subject = f"[ai-estimator-report]-{user.username}" + (f"-{rep_title}" if rep_title else "")
    stamp = datetime.now(_tz.utc).strftime("%Y%m%d-%H%M%S")
    attach_name = f"CREA3-estimator-report-{user.username}-{stamp}.txt"

    meta = good.meta or {}
    body_text = (
        "An AI Estimate was flagged as inaccurate on the CREA3 platform.\n\n"
        "FROM\n"
        f"  - User: {user.username}\n"
        f"  - Email: {user.email}\n"
        f"  - Dispute: #{dispute_id}\n\n"
        "ASSET\n"
        f"  - Name: {good.name}\n"
        f"  - Value on the platform: {meta.get('currency', 'EUR')} {float(good.estimated_value or 0):,.2f}\n"
        + (f"  - Description: {meta.get('description')}\n" if meta.get("description") else "")
        + ((f"\nREPORTER NOTE\n  {body.note.strip()}\n") if (body.note or "").strip() else "")
        + f"\nThe full valuation conversation ({len(rows)} messages) is attached as\n  {attach_name}\n"
        "\n—\nSent automatically by the AI Estimate report button.\n"
    )
    try:
        send_email_with_attachments(
            to_email=to_email, subject=subject, body_text=body_text,
            attachments=[(attach_name, "text/plain", transcript.encode("utf-8")[: 4 * 1024 * 1024])],
        )
    except Exception as exc:
        logger.warning("estimator report email failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not send the report.")
    return {"ok": True}
