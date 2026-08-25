from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import AuditEvent, Dispute, DisputeAgent, User
from ..schemas import DisputeCreateIn, DisputeOut
from .deps import can_access_dispute, get_current_user
from ..core.workflow import is_valid_status, can_transition

router = APIRouter(prefix="/api/disputes", tags=["disputes"])

@router.post("", response_model=DisputeOut)
def create_dispute(payload: DisputeCreateIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = Dispute(title=payload.title, method=payload.method, created_by_id=user.id, status="draft")
    session.add(d)
    session.commit()
    session.refresh(d)
    session.add(AuditEvent(dispute_id=d.id, actor_user_id=user.id, event_type="DisputeCreated", payload={"method": d.method, "title": d.title}))

    # The creator is automatically a participant (claimant), already joined.
    # Their entitlement is the remainder: 1 - (sum of the other parties' shares).
    # At creation there are no other parties yet, so they start at 100%; as the
    # creator invites others and assigns them shares, the creator's share is
    # recomputed to the remainder (see api/agents.py).
    creator_agent = DisputeAgent(
        dispute_id=d.id,
        user_id=user.id,
        name=(user.username or user.email),
        email=user.email,
        role_in_dispute="claimant",
        entitlement_share=1.0,
        invite_status="joined",
    )
    session.add(creator_agent)
    session.add(AuditEvent(
        dispute_id=d.id, actor_user_id=user.id, event_type="AgentInvited",
        payload={"email": user.email, "share": 1.0, "role_in_dispute": "claimant", "self": True},
    ))
    session.commit()
    return DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status, created_by_id=d.created_by_id)

@router.get("", response_model=list[DisputeOut])
def list_disputes(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    if user.role == "admin":  # legacy override (no admin role is issued any more)
        q = select(Dispute)
    else:
        # agent / mediator: disputes they created OR where their email is assigned
        q = (
            select(Dispute)
            .outerjoin(DisputeAgent, DisputeAgent.dispute_id == Dispute.id)
            .where((Dispute.created_by_id == user.id) | (DisputeAgent.email == user.email))
            .distinct()
        )
    disputes = session.exec(q.order_by(Dispute.id.desc())).all()
    # Hide soft-deleted disputes from the active list (they remain in the archive).
    disputes = [d for d in disputes if not getattr(d, "hidden_from_active", False)]
    return [DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status, created_by_id=d.created_by_id) for d in disputes]

@router.get("/{dispute_id}", response_model=DisputeOut)
def get_dispute(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = can_access_dispute(dispute_id, user, session)
    return DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status, created_by_id=d.created_by_id)

@router.patch("/{dispute_id}/status", response_model=DisputeOut)
def set_status(dispute_id: int, status_value: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = can_access_dispute(dispute_id, user, session)
    # Only creator/admin can set status
    if user.role != "admin" and d.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can change status")

    if not is_valid_status(status_value):
        raise HTTPException(status_code=400, detail=f"Unknown status '{status_value}'.")
    if not can_transition(d.status, status_value):
        raise HTTPException(
            status_code=409,
            detail=f"Illegal status transition: {d.status} -> {status_value}.",
        )

    d.status = status_value
    session.add(d)
    session.add(AuditEvent(dispute_id=d.id, actor_user_id=user.id, event_type="DisputeStatusChanged", payload={"status": d.status}))
    session.commit()
    session.refresh(d)
    return DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status, created_by_id=d.created_by_id)

@router.post("/{dispute_id}/abandon", response_model=DisputeOut)
def abandon_dispute(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Any participant may abandon the dispute. This ENDS it for everyone:
    the status moves to 'abandoned' (terminal) and the other participants are
    notified. Already-finalized or already-abandoned disputes cannot be abandoned.
    """
    d = can_access_dispute(dispute_id, user, session)
    if d.status in ("finalized", "abandoned"):
        raise HTTPException(status_code=409, detail=f"Dispute is already {d.status}.")

    # Identify who abandoned (the participant or the owner), for the notice.
    actor = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.email == user.email,
        )
    ).first()
    actor_name = (actor.name if actor else None) or user.username or user.email

    d.status = "abandoned"
    session.add(d)
    session.add(AuditEvent(
        dispute_id=d.id, actor_user_id=user.id,
        event_type="DisputeAbandoned", payload={"by": actor_name},
    ))
    session.commit()
    session.refresh(d)

    # Notify everyone else the dispute was abandoned.
    try:
        from ..services.notifications import notify_dispute
        notify_dispute(
            session, dispute_id=dispute_id, type="DisputeAbandoned",
            payload={"agent_name": actor_name}, actor_user_id=user.id,
        )
    except Exception:
        import logging; logging.getLogger("crea3.notify").warning("notify failed", exc_info=True)

    return DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status, created_by_id=d.created_by_id)

@router.get("/archive/list")
def archive_list(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """For the archive view: every dispute the current user participates in, with
    its current status, a compact status history (from the audit log), and whether
    a PDF report has been generated (downloadable at /api/disputes/{id}/report).
    """
    from ..models import Report

    # Disputes the user owns or is an agent in.
    owned = session.exec(select(Dispute).where(Dispute.created_by_id == user.id)).all()
    agent_rows = session.exec(
        select(DisputeAgent).where(
            (DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email)
        )
    ).all()
    agent_dispute_ids = {a.dispute_id for a in agent_rows}
    by_id: dict[int, Dispute] = {d.id: d for d in owned}
    for did in agent_dispute_ids:
        if did not in by_id:
            d = session.get(Dispute, did)
            if d:
                by_id[did] = d

    out = []
    for did, d in by_id.items():
        if d.status == "deleted":
            continue  # deleted disputes are gone from everywhere, incl. the archive
        # The archive lists archived or closed disputes only (not active ones).
        if not (getattr(d, "hidden_from_active", False) or d.status in ("finalized", "abandoned")):
            continue
        # Status history from the audit log (status changes + lifecycle events).
        events = session.exec(
            select(AuditEvent).where(AuditEvent.dispute_id == did).order_by(AuditEvent.created_at.asc())
        ).all()
        history = []
        for e in events:
            if e.event_type in (
                "DisputeCreated", "DisputeStatusChanged", "ProposalGenerated",
                "ProposalAccepted", "DisputeAbandoned", "ReportGenerated",
            ):
                label = e.event_type
                if e.event_type == "DisputeStatusChanged":
                    label = f"Status: {(e.payload or {}).get('status', '?')}"
                history.append({"event": label, "at": e.created_at.isoformat()})
        report = session.exec(select(Report).where(Report.dispute_id == did)).first()
        out.append({
            "dispute_id": did,
            "title": d.title,
            "status": d.status,
            "is_closed": d.status in ("finalized", "abandoned"),
            "has_report": report is not None,
            "history": history,
        })
    # Closed first, then by id desc.
    out.sort(key=lambda x: (not x["is_closed"], -x["dispute_id"]))
    return out

def _abandon(session: Session, d: Dispute, user: User) -> None:
    """Mark a dispute abandoned (terminal) and notify the other participants.
    No-op if it is already finalized, abandoned or deleted."""
    if d.status in ("finalized", "abandoned", "deleted"):
        return
    actor = session.exec(
        select(DisputeAgent).where(DisputeAgent.dispute_id == d.id, DisputeAgent.email == user.email)
    ).first()
    actor_name = (actor.name if actor else None) or user.username or user.email
    d.status = "abandoned"
    session.add(d)
    session.add(AuditEvent(dispute_id=d.id, actor_user_id=user.id,
                           event_type="DisputeAbandoned", payload={"by": actor_name}))
    session.commit()
    try:
        from ..services.notifications import notify_dispute
        notify_dispute(session, dispute_id=d.id, type="DisputeAbandoned",
                       payload={"agent_name": actor_name}, actor_user_id=user.id)
    except Exception:
        import logging; logging.getLogger("crea3.notify").warning("notify failed", exc_info=True)


@router.post("/{dispute_id}/archive")
def archive_dispute(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Archive a dispute: abandon it (if still active) and remove it from the
    active list, but KEEP it accessible from the archive. Owner/admin only."""
    d = can_access_dispute(dispute_id, user, session)
    if user.role != "admin" and d.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can archive")
    _abandon(session, d, user)
    d.hidden_from_active = True
    session.add(d)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="DisputeArchived", payload={}))
    session.commit()
    return {"ok": True, "archived": True}


@router.delete("/{dispute_id}")
def delete_dispute(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Delete a dispute COMPLETELY: the dispute and all of its data (agents,
    goods, preferences, proposals, acceptances, reconciliation responses,
    mediation slots, reports, documents, notes, notifications and audit events)
    are permanently removed from everywhere. Owner/admin only."""
    d = can_access_dispute(dispute_id, user, session)
    if user.role != "admin" and d.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete")

    from ..models import (
        DisputeAgent, Good, Preference, Strategy, AllocationProposal, Acceptance,
        ReconciliationResponse, MediationSlot, Report, AuditEvent, Notification,
        DisputeDocument, MediatorNote,
    )

    # Acceptances hang off proposals (they have no dispute_id), so remove them first.
    prop_ids = [p.id for p in session.exec(
        select(AllocationProposal).where(AllocationProposal.dispute_id == dispute_id)
    ).all()]
    if prop_ids:
        for acc in session.exec(select(Acceptance).where(Acceptance.proposal_id.in_(prop_ids))).all():
            session.delete(acc)

    # Everything else keyed by dispute_id — children before parents.
    for Model in (
        ReconciliationResponse, Preference, Strategy, MediationSlot, Report,
        DisputeDocument, MediatorNote, Notification, AuditEvent,
        AllocationProposal, Good, DisputeAgent,
    ):
        for row in session.exec(select(Model).where(Model.dispute_id == dispute_id)).all():
            session.delete(row)

    session.delete(d)
    session.commit()
    return {"ok": True, "deleted": True}
