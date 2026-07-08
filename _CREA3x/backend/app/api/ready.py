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
    participant = get_participant(dispute_id, user, session)
    participant = require_participant_role(participant, deny_roles=("mediator",))
    participant.ready = bool(payload.ready)
    session.add(participant)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="ParticipantReadySet", payload={"ready": participant.ready, "agent_id": participant.id}))
    session.commit()

    # If all non-mediator joined participants ready -> move to reconciling
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id, DisputeAgent.invite_status == "joined")).all()
    non_mediators = [a for a in agents if (a.role_in_dispute or "agent") != "mediator"]
    if non_mediators and all(a.ready for a in non_mediators):
        # Entitlement-share invariant: the joined non-mediator parties' shares
        # must sum to ~1.0 before the dispute can be validated. This prevents
        # structurally incoherent disputes (e.g. three parties each at 0.9).
        total_share = sum(float(a.entitlement_share or 0.0) for a in non_mediators)
        if abs(total_share - 1.0) > 0.01:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Entitlement shares of the {len(non_mediators)} parties must sum to 1.0 "
                    f"before validation (currently {round(total_share, 4)})."
                ),
            )
        # Move into the reconciliation stage. Both parties must agree (or not) on
        # divergent valuations and respond to omitted items before a proposal can
        # be generated, which makes the resulting proposal uniquely defined.
        dispute.status = "reconciling"
        session.add(dispute)
        session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="DisputeMovedToReconciling", payload={}))
        session.commit()
    return {"ok": True, "dispute_status": dispute.status}
