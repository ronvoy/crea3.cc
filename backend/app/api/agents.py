from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Dispute, DisputeAgent, AuditEvent, User
from ..schemas import AgentAddIn
from .deps import get_current_user, can_access_dispute

# ✅ custom email (se già l’hai nel progetto CREAV7)
from ..core.email import send_dispute_invitation_email


router = APIRouter(prefix="/api/disputes/{dispute_id}/agents", tags=["agents"])


def _can_manage_participants(dispute_id: int, user: User, session: Session) -> None:
    """
    Owner/admin oppure joined agent (non mediator) possono gestire inviti.
    (Allinea alla logica che avevi già nelle versioni precedenti.)
    """
    dispute = session.get(Dispute, dispute_id)
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    participant = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            (DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email),
        )
    ).first()

    is_joined_non_mediator = bool(
        participant
        and (participant.role_in_dispute or "agent") != "mediator"
        and participant.invite_status in ("joined", "accepted")
    )

    if user.role != "admin" and dispute.created_by_id != user.id and not is_joined_non_mediator:
        raise HTTPException(status_code=403, detail="Not allowed")


@router.get("")
def list_agents(
    dispute_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    can_access_dispute(dispute_id, user, session)
    agents = session.exec(
        select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)
    ).all()
    return agents


@router.post("")
def add_agent(
    dispute_id: int,
    payload: AgentAddIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dispute = can_access_dispute(dispute_id, user, session)
    _can_manage_participants(dispute_id, user, session)

    agent = DisputeAgent(
        dispute_id=dispute_id,
        name=payload.name,
        email=payload.email,
        entitlement_share=payload.entitlement_share,
        role_in_dispute=payload.role_in_dispute,
    )

    # opzionali (se presenti nel tuo model CREAV7)
    if hasattr(agent, "invited_by_user_id"):
        agent.invited_by_user_id = user.id

    session.add(agent)
    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=user.id,
            event_type="AgentInvited",
            payload={
                "email": payload.email,
                "share": float(payload.entitlement_share or 0.0),
                "role_in_dispute": payload.role_in_dispute or "agent",
            },
        )
    )
    session.commit()
    session.refresh(agent)

    # ✅ INVIO MAIL CUSTOM (best-effort)
    try:
        send_dispute_invitation_email(
            to_email=agent.email,
            invited_name=agent.name,
            invited_role=(agent.role_in_dispute or "agent"),
            dispute_id=int(dispute.id),
            dispute_title=dispute.title,
            invited_by_name=(user.username or user.email),
            invited_by_email=user.email,
            entitlement_share=float(agent.entitlement_share or 0.0),
        )
    except Exception:
        # best-effort: non bloccare la creazione partecipante
        pass

    return agent


@router.post("/{agent_id}/resend-invite")
def resend_invite(
    dispute_id: int,
    agent_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dispute = can_access_dispute(dispute_id, user, session)
    _can_manage_participants(dispute_id, user, session)

    agent = session.get(DisputeAgent, agent_id)
    if not agent or agent.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    status = (agent.invite_status or "").lower()
    # ✅ solo per invited/pending (non per joined)
    if status in ("joined", "accepted"):
        raise HTTPException(status_code=409, detail="Agent already joined")

    if status not in ("invited", "pending", "declined"):
        # se hai altri stati custom, mantieni comunque “invited/pending”
        raise HTTPException(status_code=409, detail=f"Cannot resend for status={agent.invite_status}")

    try:
        send_dispute_invitation_email(
            to_email=agent.email,
            invited_name=agent.name,
            invited_role=(agent.role_in_dispute or "agent"),
            dispute_id=int(dispute.id),
            dispute_title=dispute.title,
            invited_by_name=(user.username or user.email),
            invited_by_email=user.email,
            entitlement_share=float(agent.entitlement_share or 0.0),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Invite email failed: {type(e).__name__}")

    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=user.id,
            event_type="InviteResent",
            payload={"agent_id": agent_id, "email": agent.email},
        )
    )
    session.commit()
    return {"ok": True}


@router.patch("/{agent_id}")
def update_agent(
    dispute_id: int,
    agent_id: int,
    payload: AgentAddIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    can_access_dispute(dispute_id, user, session)
    _can_manage_participants(dispute_id, user, session)

    agent = session.get(DisputeAgent, agent_id)
    if not agent or agent.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.name = payload.name
    agent.email = payload.email
    agent.entitlement_share = payload.entitlement_share
    agent.role_in_dispute = payload.role_in_dispute

    session.add(agent)
    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=user.id,
            event_type="AgentUpdated",
            payload={"agent_id": agent_id},
        )
    )
    session.commit()
    session.refresh(agent)
    return agent


@router.delete("/{agent_id}")
def delete_agent(
    dispute_id: int,
    agent_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    can_access_dispute(dispute_id, user, session)
    _can_manage_participants(dispute_id, user, session)

    agent = session.get(DisputeAgent, agent_id)
    if not agent or agent.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    session.delete(agent)
    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=user.id,
            event_type="AgentDeleted",
            payload={"agent_id": agent_id},
        )
    )
    session.commit()
    return {"ok": True}
