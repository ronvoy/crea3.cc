"""Builds a human-readable, privacy-safe, FULL timeline of a dispute.

Every recorded procedural event is listed chronologically. Individual
preferences/ratings are NEVER disclosed: a PreferenceSubmitted event becomes a
neutral "a party submitted/updated their valuations" line, never the star
values, amounts, or which asset.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from ..models import AuditEvent, User


def _fmt_dt(dt: datetime) -> str:
    try:
        return dt.strftime("%d %b %Y, %H:%M")
    except Exception:
        return str(dt)


# Map every event type to a neutral, non-expert-friendly description.
# A value of None means "skip". Functions receive (actor, payload).
def _describe(et: str, actor: str, payload: dict[str, Any]) -> str | None:
    if et == "DisputeCreated":
        return f"Dispute opened by {actor}."
    if et == "AgentInvited":
        who = payload.get("name") or payload.get("email") or "a participant"
        return f"{actor} invited {who} to take part."
    if et in ("InvitationResponded", "InvitationAccepted", "InvitationDeclined"):
        accepted = payload.get("accept")
        if accepted is None:
            accepted = et == "InvitationAccepted"
        return f"{actor} {'accepted' if accepted else 'declined'} the invitation to participate."
    if et == "AgentRemoved":
        return f"{actor} removed a participant from the dispute."
    if et == "GoodAdded":
        nm = payload.get("name")
        return f"{actor} added an asset to the dispute" + (f": {nm}." if nm else ".")
    if et == "GoodUpdated":
        return f"{actor} updated an asset."
    if et == "GoodRemoved":
        return f"{actor} removed an asset."
    if et in ("PreferenceSubmitted", "PreferenceUpdated"):
        # Never reveal values.
        return f"{actor} submitted their valuations (kept confidential)."
    if et == "StrategySaved":
        return f"{actor} saved a private strategy note."
    if et == "ParticipantReadySet":
        if payload.get("ready"):
            return f"{actor} marked their input as complete."
        return f"{actor} reopened their input."
    if et == "DisputeMovedToValidating":
        return "All parties completed their input; the dispute moved to validation."
    if et == "DisputeMovedToReconciling":
        return "The dispute moved to reconciliation, where the parties review differing valuations and one-sided assets."
    if et == "ReconciliationResponded":
        kind = payload.get("kind")
        if kind == "value":
            agreed = payload.get("agreed")
            return f"{actor} {'agreed to use the average value' if agreed else 'chose to keep their own value'} for an asset valued differently."
        if kind == "omitted":
            return f"{actor} responded on an asset only one party had declared."
        return f"{actor} responded during reconciliation."
    if et == "ProposalGenerated":
        return "An equitable allocation proposal was generated."
    if et == "ProposalAccepted":
        return f"{actor} accepted the proposed allocation."
    if et == "ProposalRejected":
        return f"{actor} declined the proposed allocation."
    if et == "DisputeAcceptedAll":
        return "All parties accepted the allocation."
    if et == "GoodsFinished":
        return f"{actor} finished adding goods."
    if et == "GoodsReopened":
        return f"{actor} reopened goods for editing."
    if et == "DisputeAbandoned":
        by = (payload or {}).get("by") or actor
        return f"{by} abandoned the dispute; it was closed."
    if et == "EntitlementClaimed":
        return f"{actor} stated the entitlement share they consider fair."
    if et == "MediationSlotProposed":
        return f"{actor} proposed a session date."
    if et == "MediationSlotConfirmed":
        return "A session date was confirmed by the parties."
    if et == "MediationSlotDeclined":
        return f"{actor} withdrew their agreement to a proposed session date."
    if et == "MediationSlotRemoved":
        return f"{actor} removed a proposed session date."
    if et in ("ReportGenerated", "ProposalReportGenerated"):
        return "A report was generated."
    if et == "DisputeStatusChanged":
        to = payload.get("to") or payload.get("status")
        return f"The dispute status changed{f' to {to}' if to else ''}."
    if et == "DisputeFinalized":
        return "The dispute was finalized."
    # Unknown/!internal events: produce a generic readable line rather than leak raw type.
    return None


def build_history(session: Session, dispute_id: int, major_only: bool = True) -> list[dict[str, str]]:
    """Return the list of {date, text} timeline entries, oldest first.

    By default only MAJOR milestones are included (creation, proposal generated,
    proposal accepted/rejected, meeting confirmed, dispute finalized/abandoned,
    etc.) so the report timeline stays short and readable. Granular per-action
    events (each good added, each rating, each reconciliation response) are
    omitted. Pass major_only=False for the full log.
    """
    MAJOR_EVENTS = {
        "DisputeCreated",
        "ProposalGenerated",
        "ProposalAccepted",
        "ProposalRejected",
        "DisputeAcceptedAll",
        "MediationSlotConfirmed",
        "DisputeAbandoned",
        "DisputeFinalized",
    }

    events = session.exec(
        select(AuditEvent)
        .where(AuditEvent.dispute_id == dispute_id)
        .order_by(AuditEvent.created_at.asc())
    ).all()

    user_ids = {e.actor_user_id for e in events if e.actor_user_id is not None}
    users: dict[int, str] = {}
    if user_ids:
        for u in session.exec(select(User).where(User.id.in_(list(user_ids)))).all():
            users[u.id] = u.username or u.email

    entries: list[dict[str, str]] = []
    for e in events:
        if major_only and e.event_type not in MAJOR_EVENTS:
            continue
        actor = users.get(e.actor_user_id or -1, "A participant")
        text = _describe(e.event_type, actor, e.payload or {})
        if text:
            entries.append({"date": _fmt_dt(e.created_at), "text": text})
    return entries
