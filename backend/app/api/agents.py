from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import DisputeAgent, AuditEvent, User
from ..schemas import AgentAddIn
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/agents", tags=["agents"])

@router.get("")
def list_agents(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all()
    return agents

@router.post("")
def add_agent(dispute_id: int, payload: AgentAddIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    participant = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id==dispute_id, (DisputeAgent.user_id==user.id) | (DisputeAgent.email==user.email))).first()
    if user.role != "admin" and dispute.created_by_id != user.id and not (participant and (participant.role_in_dispute or 'agent') != 'mediator' and participant.invite_status=='joined'):
        raise HTTPException(status_code=403, detail="Only owner/admin or joined agents can invite participants")
    agent = DisputeAgent(dispute_id=dispute_id, name=payload.name, email=payload.email, entitlement_share=payload.entitlement_share, role_in_dispute=payload.role_in_dispute)
    session.add(agent)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="AgentInvited", payload={"email": payload.email, "share": payload.entitlement_share}))
    session.commit()
    session.refresh(agent)
    return agent

@router.patch("/{agent_id}")
def update_agent(dispute_id: int, agent_id: int, payload: AgentAddIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    participant = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id==dispute_id, (DisputeAgent.user_id==user.id) | (DisputeAgent.email==user.email))).first()
    if user.role != "admin" and dispute.created_by_id != user.id and not (participant and (participant.role_in_dispute or 'agent') != 'mediator' and participant.invite_status=='joined'):
        raise HTTPException(status_code=403, detail="Only owner/admin or joined agents can edit participants")
    agent = session.get(DisputeAgent, agent_id)
    if not agent or agent.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.name = payload.name
    agent.email = payload.email
    agent.entitlement_share = payload.entitlement_share
    agent.role_in_dispute = payload.role_in_dispute
    session.add(agent)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="AgentUpdated", payload={"agent_id": agent_id}))
    session.commit()
    session.refresh(agent)
    return agent

@router.delete("/{agent_id}")
def delete_agent(dispute_id: int, agent_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    participant = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id==dispute_id, (DisputeAgent.user_id==user.id) | (DisputeAgent.email==user.email))).first()
    if user.role != "admin" and dispute.created_by_id != user.id and not (participant and (participant.role_in_dispute or 'agent') != 'mediator' and participant.invite_status=='joined'):
        raise HTTPException(status_code=403, detail="Only owner/admin or joined agents can remove participants")
    agent = session.get(DisputeAgent, agent_id)
    if not agent or agent.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Agent not found")
    session.delete(agent)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="AgentDeleted", payload={"agent_id": agent_id}))
    session.commit()
    return {"ok": True}
