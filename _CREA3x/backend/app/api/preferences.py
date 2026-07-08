from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import AuditEvent, Dispute, DisputeAgent, Good, Preference, User
from ..schemas import PreferenceUpsertIn
from ..services.proposals_service import maybe_generate_proposal
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/preferences", tags=["preferences"])


def _ensure_unlocked(dispute: Dispute) -> None:
    if dispute.status not in ("draft", "collecting"):
        raise HTTPException(status_code=400, detail="Dispute is locked for edits in the current stage")


def _get_participant_any(dispute_id: int, user: User, session: Session) -> DisputeAgent | None:
    return session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            ((DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email)),
        )
    ).first()


def _ensure_can_submit_preferences(participant: DisputeAgent, user: User) -> None:
    if getattr(user, "role", None) == "mediator":
        raise HTTPException(status_code=403, detail="Mediators are not allowed to submit preferences.")
    if (participant.role_in_dispute or "agent").lower() == "mediator":
        raise HTTPException(status_code=403, detail="Mediators are not allowed to submit preferences.")
    if participant.invite_status != "joined":
        raise HTTPException(status_code=403, detail="You must accept the invite first.")


def _recompute_ready_flag(session: Session, *, dispute_id: int, participant: DisputeAgent) -> bool:
    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    good_ids = {g.id for g in goods if g.id is not None}
    if not good_ids:
        participant.ready = False
        session.add(participant)
        session.commit()
        return False

    prefs = session.exec(
        select(Preference).where(
            Preference.dispute_id == dispute_id,
            Preference.agent_id == participant.id,
            Preference.method == "rates",
            Preference.stars != None,  # noqa: E711
        )
    ).all()

    rated = {p.good_id for p in prefs if p.good_id is not None}
    all_rated = rated == good_ids
    # Do NOT auto-confirm readiness. The party must explicitly confirm they are
    # finished (POST /ready) after rating all assets. Here we only REVOKE a prior
    # confirmation if their rating set is no longer complete (e.g. a new asset was
    # added, or they cleared a rating).
    if not all_rated and participant.ready:
        participant.ready = False
        session.add(participant)
        session.commit()
    return all_rated


@router.get("")
def list_my_preferences(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    participant = _get_participant_any(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="You are not a participant in this dispute.")
    if getattr(user, "role", None) == "mediator" or (participant.role_in_dispute or "").lower() == "mediator":
        raise HTTPException(status_code=403, detail="Mediators cannot access preferences.")
    prefs = session.exec(
        select(Preference).where(
            Preference.dispute_id == dispute_id,
            Preference.agent_id == participant.id,
        )
    ).all()
    return prefs


@router.post("")
def upsert_preference(
    dispute_id: int,
    payload: PreferenceUpsertIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dispute = can_access_dispute(dispute_id, user, session)
    participant = _get_participant_any(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="You are not a participant in this dispute.")

    _ensure_can_submit_preferences(participant, user)
    _ensure_unlocked(dispute)

    # Preferences open only once (a) every invited party has responded (none still
    # pending) and (b) ALL joined non-mediator parties have finished adding goods.
    all_joined = session.exec(
        select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)
    ).all()
    pending = [a for a in all_joined if (a.invite_status or "invited") == "invited"
               and (a.role_in_dispute or "agent").lower() != "mediator"]
    if pending:
        raise HTTPException(
            status_code=409,
            detail="All invited parties must accept before preferences open.",
        )
    parties = [a for a in all_joined if a.invite_status == "joined"
               and (a.role_in_dispute or "agent").lower() != "mediator"]
    if parties and not all(bool(getattr(a, "goods_locked", False)) for a in parties):
        raise HTTPException(
            status_code=409,
            detail="All parties must finish adding goods before preferences open.",
        )

    # Enforce rates-only mode (remove bids)
    if dispute.method != "rates":
        dispute.method = "rates"
        session.add(dispute)

    if payload.stars is None:
        raise HTTPException(status_code=400, detail="stars required (rates-only mode)")
    stars = int(payload.stars)
    if stars < 0 or stars > 5:
        raise HTTPException(status_code=400, detail="stars must be between 0 and 5")
    # The party's own valuation of the good (optional) is stored in bid_amount.
    own_value = payload.value_amount if payload.value_amount is not None else payload.bid_amount

    good = session.get(Good, payload.good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")

    existing = session.exec(
        select(Preference).where(
            Preference.dispute_id == dispute_id,
            Preference.agent_id == participant.id,
            Preference.good_id == payload.good_id,
        )
    ).first()

    if existing:
        existing.method = "rates"
        existing.stars = stars
        # Only overwrite the party's valuation when one is provided; a plain star
        # rating must NOT wipe a value they set earlier in the Goods tab.
        if own_value is not None:
            existing.bid_amount = own_value
        session.add(existing)
        pref = existing
    else:
        pref = Preference(
            dispute_id=dispute_id,
            agent_id=participant.id,
            good_id=payload.good_id,
            method="rates",
            stars=stars,
            bid_amount=own_value,
        )
        session.add(pref)

    if dispute.status == "draft":
        dispute.status = "collecting"
        session.add(dispute)

    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=user.id,
            event_type="PreferenceSubmitted",
            payload={"good_id": payload.good_id, "method": "rates", "stars": stars},
        )
    )

    session.commit()
    session.refresh(pref)

    # Recompute completion flag. Proposal generation no longer happens here:
    # it is gated behind the reconciliation step (see api/reconciliation.py),
    # so the parties first reconcile divergent valuations and omitted items and
    # the resulting proposal is uniquely defined.
    _recompute_ready_flag(session, dispute_id=dispute_id, participant=participant)

    # No per-rating notification: individual ratings are not milestone events.
    # The next workflow milestone is the proposal (see reconciliation.finalize).

    return pref
