from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Dispute, Strategy, DisputeAgent, AuditEvent, User
from ..schemas import StrategyUpsertIn
from .deps import get_current_user, can_access_dispute, get_participant, require_participant_role

router = APIRouter(prefix="/api/disputes/{dispute_id}/strategy", tags=["strategy"])

def ensure_unlocked(dispute: Dispute):
    if dispute.status not in ("draft", "collecting"):
        raise HTTPException(status_code=400, detail="Dispute is locked for edits in the current stage")


@router.get("")
def get_strategy(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    ensure_unlocked(dispute)
    participant = get_participant(dispute_id, user, session)
    # Mediators can view all strategies
    if participant and (participant.role_in_dispute == "mediator"):
        items = session.exec(select(Strategy).where(Strategy.dispute_id == dispute_id)).all()
        return items
    # Otherwise return own strategy only
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    item = session.exec(select(Strategy).where(Strategy.dispute_id == dispute_id, Strategy.agent_id == participant.id)).first()
    return item

@router.post("")
def upsert_strategy(dispute_id: int, payload: StrategyUpsertIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    participant = require_participant_role(dispute_id, user, session, deny_roles=("mediator",))
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    existing = session.exec(select(Strategy).where(Strategy.dispute_id == dispute_id, Strategy.agent_id == participant.id)).first()
    if existing:
        existing.text = payload.text
        session.add(existing)
        sid = existing.id
    else:
        s = Strategy(dispute_id=dispute_id, agent_id=participant.id, text=payload.text)
        session.add(s)
        session.commit()
        session.refresh(s)
        sid = s.id
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="StrategyUpserted", payload={"strategy_id": sid}))
    session.commit()
    return {"ok": True}
