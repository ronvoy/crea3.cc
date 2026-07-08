from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Dispute, DisputeAgent, AuditEvent, User
from ..schemas import InvitationRespondIn, InvitationOut
from .deps import get_current_user


def utcnow():
    return datetime.now(timezone.utc)


router = APIRouter(prefix="/api/invitations", tags=["invitations"])


@router.get("", response_model=list[InvitationOut])
def list_my_invitations(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Invitations addressed to this email and still pending
    stmt = (
        select(DisputeAgent, Dispute)
        .join(Dispute, Dispute.id == DisputeAgent.dispute_id)
        .where(
            DisputeAgent.email == user.email,
            DisputeAgent.invite_status == "invited",
        )
        .order_by(DisputeAgent.id.desc())
    )

    rows = session.exec(stmt).all()

    out: list[InvitationOut] = []
    for agent, dispute in rows:
        out.append(
            InvitationOut(
                agent_id=agent.id,
                dispute_id=dispute.id,
                dispute_title=dispute.title,
                invited_as=(agent.role_in_dispute or "agent"),
                invite_status=agent.invite_status,
                entitlement_share=float(agent.entitlement_share or 0.0),
                invited_at=getattr(agent, "invited_at", None),
                invited_by_email=None,
                invited_by_username=None,
            )
        )
    return out


@router.post("/{dispute_id}/respond")
def respond_invitation(
    dispute_id: int,
    payload: InvitationRespondIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    agent = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.email == user.email,
        )
    ).first()

    if not agent:
        raise HTTPException(status_code=404, detail="Invitation not found for this email")

    if agent.invite_status != "invited":
        return {"ok": True, "invite_status": agent.invite_status}

    # Link agent row to user and set status
    agent.user_id = user.id
    agent.invite_status = "joined" if payload.accept else "declined"

    # If your model has comment/responded_at fields, set them safely
    if hasattr(agent, "invite_comment"):
        try:
            setattr(agent, "invite_comment", payload.comment)
        except Exception:
            pass
    if hasattr(agent, "responded_at"):
        try:
            setattr(agent, "responded_at", utcnow())
        except Exception:
            pass

    session.add(agent)
    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=user.id,
            event_type="InvitationResponded",
            payload={"accept": bool(payload.accept), "comment": payload.comment},
        )
    )
    session.commit()

    # Milestone-only notification: fire ONLY when this acceptance means every
    # invited party has now joined (the dispute can move to the goods phase).
    # Individual accept/decline actions are not notified.
    try:
        if payload.accept:
            from ..services.notifications import notify_dispute
            agents = session.exec(
                select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)
            ).all()
            parties = [a for a in agents if (a.role_in_dispute or "agent").lower() != "mediator"]
            pending = [a for a in parties if (a.invite_status or "invited") == "invited"]
            if parties and not pending and len(parties) >= 2:
                notify_dispute(
                    session, dispute_id=dispute_id, type="AllPartiesJoined",
                    payload={}, actor_user_id=None,
                )
    except Exception:
        import logging; logging.getLogger("crea3.notify").warning("notify failed", exc_info=True)

    return {"ok": True, "invite_status": agent.invite_status}
