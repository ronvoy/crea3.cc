from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import DisputeAgent, Dispute, AuditEvent, User
from ..schemas import NotificationInviteOut
from .deps import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@router.get("", response_model=list[NotificationInviteOut])
def list_notifications(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    invites = session.exec(
        select(DisputeAgent, Dispute).join(Dispute, Dispute.id == DisputeAgent.dispute_id).where(
            DisputeAgent.email == user.email,
            DisputeAgent.invite_status == "invited",
        )
    ).all()
    out: list[NotificationInviteOut] = []
    for agent, dispute in invites:
        out.append(NotificationInviteOut(
            id=agent.id,
            dispute_id=dispute.id,
            dispute_title=dispute.title,
            role_in_dispute=agent.role_in_dispute or "agent",
            invite_status=agent.invite_status,
        ))
    return out

@router.post("/{invite_id}/accept")
def accept_invite(invite_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    agent = session.get(DisputeAgent, invite_id)
    if not agent or agent.email != user.email:
        raise HTTPException(status_code=404, detail="Invite not found")
    agent.invite_status = "joined"
    agent.user_id = user.id
    session.add(agent)
    session.add(AuditEvent(dispute_id=agent.dispute_id, actor_user_id=user.id, event_type="InviteAccepted", payload={"agent_id": agent.id}))
    session.commit()
    return {"ok": True, "dispute_id": agent.dispute_id}

@router.post("/{invite_id}/decline")
def decline_invite(invite_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    agent = session.get(DisputeAgent, invite_id)
    if not agent or agent.email != user.email:
        raise HTTPException(status_code=404, detail="Invite not found")
    session.delete(agent)
    session.add(AuditEvent(dispute_id=agent.dispute_id, actor_user_id=user.id, event_type="InviteDeclined", payload={"agent_id": invite_id}))
    session.commit()
    return {"ok": True}
