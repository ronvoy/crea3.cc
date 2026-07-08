from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Dispute, DisputeAgent, AuditEvent, User
from ..schemas import AgentAddIn, ClaimedShareIn
from .deps import get_current_user, can_access_dispute, get_participant
from ..core.authz import require_can_manage_structure

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
    # Lock structural edits once the dispute leaves an editable status.
    require_can_manage_structure(session, dispute_id, user)

    # Entitlement rules: a party (non-mediator) must hold between 1% and 99%;
    # mediators hold 0%. The sum across parties is checked against 100% below.
    is_mediator = (payload.role_in_dispute or "").lower() == "mediator"

    # Role rule:
    #  - The dispute owner (first claimant) may add any participant (parties or
    #    mediators), but parties only while still in the goods phase.
    #  - A joined non-owner party may ONLY add mediators.
    is_owner = (dispute.created_by_id == user.id) or (user.role == "admin")
    if not is_owner and not is_mediator:
        raise HTTPException(
            status_code=403,
            detail="Only the claimant who created the dispute can add parties. You may invite mediators.",
        )

    # No NEW PARTIES once preferences have opened (all joined parties locked, none
    # pending) or the dispute moved past the goods phase. Mediators still allowed.
    if not is_mediator:
        _all = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all()
        _parties = [a for a in _all if a.invite_status == "joined" and (a.role_in_dispute or "agent").lower() != "mediator"]
        _pending = [a for a in _all if (a.invite_status or "invited") == "invited" and (a.role_in_dispute or "agent").lower() != "mediator"]
        prefs_open = (
            dispute.status not in ("draft", "collecting")
            or (bool(_parties) and not _pending and all(bool(getattr(a, "goods_locked", False)) for a in _parties))
        )
        if prefs_open:
            raise HTTPException(
                status_code=409,
                detail="Parties can no longer be added once preferences have opened.",
            )

    if is_mediator:
        share = 0.0
    else:
        share = float(payload.entitlement_share or 0.0)
        if share < 0.01 or share > 0.99:
            raise HTTPException(status_code=400, detail="Entitlement share must be between 1% and 99%.")
        # The creator (self) holds the REMAINDER, so the other parties plus this
        # new share must leave a positive remainder for the creator.
        existing = session.exec(
            select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)
        ).all()
        creator_agent = next(
            (a for a in existing if a.user_id == dispute.created_by_id
             and (a.role_in_dispute or "").lower() != "mediator"),
            None,
        )
        others_excl_creator = sum(
            float(a.entitlement_share or 0.0)
            for a in existing
            if (a.role_in_dispute or "").lower() != "mediator"
            and not (creator_agent and a.id == creator_agent.id)
        )
        if others_excl_creator + share > 0.99 + 1e-9:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Total entitlement of the other parties would leave nothing for you "
                    f"(others would be {(others_excl_creator + share)*100:.0f}%). "
                    f"Lower this share so the parties' total stays below 100%."
                ),
            )

    agent = DisputeAgent(
        dispute_id=dispute_id,
        name=payload.name,
        email=payload.email,
        entitlement_share=share,
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

    # Recompute the creator's (self) entitlement as the remainder: 1 - sum of the
    # other non-mediator parties. Keeps the parties' shares summing to 100%.
    if not is_mediator:
        all_agents = session.exec(
            select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)
        ).all()
        creator_agent = next(
            (a for a in all_agents if a.user_id == dispute.created_by_id
             and (a.role_in_dispute or "").lower() != "mediator"),
            None,
        )
        if creator_agent is not None and creator_agent.id != agent.id:
            others_sum = sum(
                float(a.entitlement_share or 0.0)
                for a in all_agents
                if (a.role_in_dispute or "").lower() != "mediator"
                and a.id != creator_agent.id
            )
            remainder = round(max(0.0, 1.0 - others_sum), 4)
            creator_agent.entitlement_share = remainder
            session.add(creator_agent)
            session.commit()
    # the real error to the server log so SMTP problems are diagnosable.
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
        import logging
        logging.getLogger("crea3.email").warning(
            "Invitation email to %s failed (dispute %s): %s: %s",
            agent.email, dispute.id, type(e).__name__, e,
        )

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
    require_can_manage_structure(session, dispute_id, user)

    agent = session.get(DisputeAgent, agent_id)
    if not agent or agent.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.name = payload.name
    agent.email = payload.email
    agent.entitlement_share = max(0.0, min(1.0, float(payload.entitlement_share or 0.0)))
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
    require_can_manage_structure(session, dispute_id, user)

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


@router.post("/me/claimed-share")
def set_my_claimed_share(
    dispute_id: int,
    payload: ClaimedShareIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """A party records the entitlement share THEY believe they are owed.

    This does not change the share assigned by the dispute owner; it is stored
    separately. If a party's claim differs from the assigned share, the
    equitable algorithm detects the mismatch and normalizes the claimed shares
    proportionally (see the proposal's entitlement section).
    """
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this dispute")
    if (participant.role_in_dispute or "").lower() == "mediator":
        raise HTTPException(status_code=400, detail="Mediators do not hold an entitlement share.")
    participant.claimed_entitlement_share = float(payload.claimed_entitlement_share)
    if payload.position is not None:
        participant.entitlement_position = (payload.position or "").strip()[:50] or None
    session.add(participant)
    session.add(AuditEvent(
        dispute_id=dispute_id, actor_user_id=user.id,
        event_type="EntitlementClaimed",
        payload={"agent_id": participant.id, "claimed": participant.claimed_entitlement_share},
    ))
    session.commit()
    session.refresh(participant)
    return {
        "ok": True,
        "agent_id": participant.id,
        "assigned_entitlement_share": participant.entitlement_share,
        "claimed_entitlement_share": participant.claimed_entitlement_share,
        "entitlement_position": participant.entitlement_position,
    }
