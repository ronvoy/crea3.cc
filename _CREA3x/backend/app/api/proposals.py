from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Acceptance, AllocationProposal, AuditEvent, Dispute, DisputeAgent, User
from ..schemas import ProposalOut
from ..services.proposals_service import ensure_latest_proposal
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/proposals", tags=["proposals"])


class AcceptIn(BaseModel):
    accepted: bool
    comment: str | None = None


def _get_participant_any(dispute_id: int, user: User, session: Session) -> DisputeAgent | None:
    # Works both for linked (user_id) and email-only invitations.
    return session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            ((DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email)),
        )
    ).first()


def _ensure_not_mediator(user: User, participant: DisputeAgent | None) -> None:
    if getattr(user, "role", None) == "mediator":
        raise HTTPException(status_code=403, detail="Mediators can only view proposals.")
    if participant and (participant.role_in_dispute or "").lower() == "mediator":
        raise HTTPException(status_code=403, detail="Mediators can only view proposals.")


@router.get("")
def list_proposals(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    # allow mediator to list proposals (but nothing else)
    can_access_dispute(dispute_id, user, session)

    # If a realm-level mediator is trying to access, ensure they are actually invited as mediator.
    if getattr(user, "role", None) == "mediator":
        participant = _get_participant_any(dispute_id, user, session)
        if not participant or (participant.role_in_dispute or "").lower() != "mediator":
            raise HTTPException(status_code=403, detail="Mediator access denied for this dispute.")

    props = session.exec(
        select(AllocationProposal)
        .where(AllocationProposal.dispute_id == dispute_id)
        .order_by(AllocationProposal.created_at.desc())
    ).all()

    # Decision info per proposal, used by the UI to decide when a new proposal
    # may be generated: only before the first proposal, or once the current one
    # has been accepted by everyone (dispute.status == 'accepted') or rejected by
    # at least one party (a rejection does not by itself change the status).
    me = _get_participant_any(dispute_id, user, session)
    out: list[dict] = []
    for p in props:
        accs = session.exec(select(Acceptance).where(Acceptance.proposal_id == p.id)).all()
        rejected = any(a.accepted is False for a in accs)
        mine = next((a for a in accs if me is not None and a.agent_id == me.id), None)
        out.append(
            {
                "id": p.id,
                "dispute_id": p.dispute_id,
                "algorithm_version": p.algorithm_version,
                "outputs": p.outputs,
                "metrics": p.metrics,
                "explanation": p.explanation,
                "created_at": p.created_at,
                "rejected": rejected,
                "decided": mine is not None,
                "my_decision": (None if mine is None else bool(mine.accepted)),
            }
        )
    return out


@router.post("", response_model=ProposalOut)
def generate_proposal(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    participant = _get_participant_any(dispute_id, user, session)

    _ensure_not_mediator(user, participant)

    is_owner_or_admin = getattr(user, "role", None) == "admin" or dispute.created_by_id == user.id
    if not is_owner_or_admin:
        # only joined agents can trigger generation
        if not participant or participant.invite_status != "joined":
            raise HTTPException(status_code=403, detail="You must accept the invite first.")
        if (participant.role_in_dispute or "agent").lower() != "agent":
            raise HTTPException(status_code=403, detail="Not allowed.")

    try:
        # The engine produces a deterministic allocation directly from each
        # party's own valuations (divergent valuations are expected and handled
        # by the Knaster settlement). Reconciliation is an OPTIONAL refinement
        # step, not a precondition: parties may reconcile divergent values if they
        # wish, but a proposal can always be generated once enough parties are
        # ready. We therefore do not block generation on open reconciliation items.
        proposal = ensure_latest_proposal(session, dispute_id=dispute_id, actor_user_id=user.id, require_min_ready=2)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return proposal


@router.post("/{proposal_id}/accept")
def accept_proposal(
    dispute_id: int,
    proposal_id: int,
    payload: AcceptIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dispute = can_access_dispute(dispute_id, user, session)
    participant = _get_participant_any(dispute_id, user, session)
    _ensure_not_mediator(user, participant)

    if not participant or participant.invite_status != "joined":
        raise HTTPException(status_code=403, detail="You must accept the invite first.")

    # Proposal exists and belongs to dispute
    proposal = session.get(AllocationProposal, proposal_id)
    if not proposal or proposal.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Proposal not found")

    existing = session.exec(
        select(Acceptance).where(Acceptance.proposal_id == proposal_id, Acceptance.agent_id == participant.id)
    ).first()

    if existing:
        existing.accepted = bool(payload.accepted)
        existing.comment = payload.comment
        session.add(existing)
    else:
        session.add(
            Acceptance(
                proposal_id=proposal_id,
                agent_id=participant.id,
                accepted=bool(payload.accepted),
                comment=payload.comment,
            )
        )

    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=user.id,
            event_type="ProposalAccepted" if payload.accepted else "ProposalRejected",
            payload={"proposal_id": proposal_id, "accepted": bool(payload.accepted)},
        )
    )

    session.commit()

    # Mark dispute as accepted when all joined non-mediator agents accepted
    joined_agents = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.invite_status == "joined",
        )
    ).all()
    joined_agents = [a for a in joined_agents if (a.role_in_dispute or "agent").lower() != "mediator"]

    if joined_agents:
        accs = session.exec(select(Acceptance).where(Acceptance.proposal_id == proposal_id)).all()
        acc_by_agent = {a.agent_id: a for a in accs}
        if all(acc_by_agent.get(a.id) and acc_by_agent[a.id].accepted for a in joined_agents):
            if dispute.status != "accepted":
                dispute.status = "accepted"
                session.add(dispute)
                session.add(
                    AuditEvent(
                        dispute_id=dispute_id,
                        actor_user_id=user.id,
                        event_type="DisputeAcceptedAll",
                        payload={"proposal_id": proposal_id},
                    )
                )
                session.commit()

    return {"ok": True}
