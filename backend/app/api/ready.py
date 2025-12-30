from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import DisputeAgent, Dispute, AuditEvent, User
from ..schemas import ReadyIn
from .deps import get_current_user, can_access_dispute, get_participant, require_participant_role

router = APIRouter(prefix="/api/disputes/{dispute_id}/ready", tags=["ready"])

@router.post("")
def set_ready(dispute_id: int, payload: ReadyIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    participant = require_participant_role(dispute_id, user, session, deny_roles=("mediator",))
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    participant.ready = bool(payload.ready)
    session.add(participant)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="ParticipantReadySet", payload={"ready": participant.ready, "agent_id": participant.id}))
    session.commit()

    # If all non-mediator joined participants ready -> move to validating
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id, DisputeAgent.invite_status == "joined")).all()
    non_mediators = [a for a in agents if (a.role_in_dispute or "agent") != "mediator"]
    if non_mediators and all(a.ready for a in non_mediators):
        dispute.status = "validating"
        session.add(dispute)
        session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="DisputeMovedToValidating", payload={}))
        session.commit()
    return {"ok": True, "dispute_status": dispute.status}
