from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Preference, DisputeAgent, Good, Dispute, AuditEvent, User
from ..schemas import PreferenceUpsertIn
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/preferences", tags=["preferences"])

def ensure_unlocked(dispute: Dispute):
    if dispute.status not in ("draft", "collecting"):
        raise HTTPException(status_code=400, detail="Dispute is locked for edits in the current stage")


def get_agent_record(dispute_id: int, user: User, session: Session) -> DisputeAgent:
    agent = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id, (DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email))).first()
    if not agent:
        raise HTTPException(status_code=403, detail="Not an agent on this dispute")
    return agent

@router.get("")
def list_preferences(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    prefs = session.exec(select(Preference).where(Preference.dispute_id == dispute_id)).all()
    return prefs

@router.post("")
def upsert_preference(dispute_id: int, payload: PreferenceUpsertIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    ensure_unlocked(dispute)
    participant = get_agent_record(dispute_id, user, session)
    if (participant.role_in_dispute or 'agent') == 'mediator' or participant.invite_status != 'joined':
        raise HTTPException(status_code=403, detail="Only joined agents can submit preferences")
    # participant is the DisputeAgent row
    agent = get_agent_record(dispute_id, user, session)
    good = session.get(Good, payload.good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")
    existing = session.exec(
        select(Preference).where(Preference.dispute_id==dispute_id, Preference.agent_id==agent.id, Preference.good_id==payload.good_id)
    ).first()
    method = dispute.method
    if method == "bids":
        if payload.bid_amount is None:
            raise HTTPException(status_code=400, detail="bid_amount required for bids")
        if existing:
            existing.bid_amount = float(payload.bid_amount)
            existing.stars = None
            session.add(existing)
        else:
            existing = Preference(dispute_id=dispute_id, agent_id=agent.id, good_id=payload.good_id, method=method, bid_amount=float(payload.bid_amount))
            session.add(existing)
    elif method == "rates":
        if payload.stars is None:
            raise HTTPException(status_code=400, detail="stars required for rates")
        if existing:
            existing.stars = int(payload.stars)
            existing.bid_amount = None
            session.add(existing)
        else:
            existing = Preference(dispute_id=dispute_id, agent_id=agent.id, good_id=payload.good_id, method=method, stars=int(payload.stars))
            session.add(existing)
    else:
        raise HTTPException(status_code=400, detail="Unknown method")
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="PreferenceSubmitted", payload={"good_id": payload.good_id, "method": method}))
    session.commit()
    session.refresh(existing)
    return existing
