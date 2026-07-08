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
    participant.ready = rated == good_ids
    session.add(participant)
    session.commit()
    return participant.ready


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

    # Enforce rates-only mode (remove bids)
    if dispute.method != "rates":
        dispute.method = "rates"
        session.add(dispute)

    if payload.stars is None:
        raise HTTPException(status_code=400, detail="stars required (rates-only mode)")
    if payload.bid_amount is not None:
        raise HTTPException(status_code=400, detail="bid_amount is not supported (rates-only mode)")
    stars = int(payload.stars)
    if stars < 0 or stars > 5:
        raise HTTPException(status_code=400, detail="stars must be between 0 and 5")

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
        existing.bid_amount = None
        session.add(existing)
        pref = existing
    else:
        pref = Preference(
            dispute_id=dispute_id,
            agent_id=participant.id,
            good_id=payload.good_id,
            method="rates",
            stars=stars,
            bid_amount=None,
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

    # Recompute completion flag and try auto-proposal when >=2 parties completed
    _recompute_ready_flag(session, dispute_id=dispute_id, participant=participant)
    maybe_generate_proposal(session, dispute_id=dispute_id, actor_user_id=user.id, require_min_ready=2)

    return pref
