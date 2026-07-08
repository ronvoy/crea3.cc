from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..models import (
    Dispute, DisputeAgent, Good, AuditEvent, User, ReconciliationResponse,
)
from .deps import get_current_user, can_access_dispute, get_participant, require_participant_role
from ..reconciliation import compute_reconciliation_items
from ..services.proposals_service import ensure_latest_proposal

router = APIRouter(prefix="/api/disputes/{dispute_id}/reconciliation", tags=["reconciliation"])


class ValueResponseIn(BaseModel):
    good_id: int
    # "mean"  = accept the average
    # "other" = agree with the other party's value
    # "keep"  = keep my own value (divergent)
    choice: str


class OmittedResponseIn(BaseModel):
    good_id: int
    # Both optional: a party may decline to value an omitted item.
    value_amount: float | None = Field(default=None, ge=0.0)
    stars: int | None = Field(default=None, ge=0, le=5)


@router.get("")
def get_reconciliation(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """The open reconciliation items and each party's response state.

    Visible to all participants and mediators (read-only context)."""
    can_access_dispute(dispute_id, user, session)
    return compute_reconciliation_items(session, dispute_id)


def _editable(dispute: Dispute):
    if dispute.status not in ("reconciling", "collecting", "validating"):
        raise HTTPException(status_code=409, detail="Reconciliation is not open at this stage.")


@router.post("/value")
def respond_value(dispute_id: int, payload: ValueResponseIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Record this party's response to a divergent valuation.

    Symmetric: EITHER party that valued the good may accept the mean or keep the
    divergent values. The mean is applied only when all parties accept. Repeated
    calls simply update the caller's own response (idempotent)."""
    dispute = can_access_dispute(dispute_id, user, session)
    participant = require_participant_role(get_participant(dispute_id, user, session), deny_roles=("mediator",))
    _editable(dispute)
    good = session.get(Good, payload.good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")

    # Resolve the concrete values from the authoritative reconciliation state.
    recon = compute_reconciliation_items(session, dispute_id)
    item = next((it for it in recon["value_items"] if it["good_id"] == payload.good_id), None)
    if item is None:
        raise HTTPException(status_code=409, detail="No value disagreement to settle for this good.")
    vals = item.get("valuations", {})
    me = str(participant.id)
    if me not in vals:
        raise HTTPException(status_code=403, detail="Only a party who valued this good can reconcile it.")
    if payload.choice not in ("mean", "other", "keep"):
        raise HTTPException(status_code=400, detail="choice must be 'mean', 'other' or 'keep'.")

    own = float(vals[me])
    mean = float(item["mean"])
    others = [float(v) for k, v in vals.items() if k != me]
    if payload.choice == "mean":
        recorded = round(mean, 2)
    elif payload.choice == "other":
        recorded = round(others[0] if len(others) == 1 else (sum(others) / len(others)) if others else own, 2)
    else:  # keep
        recorded = round(own, 2)

    existing = session.exec(
        select(ReconciliationResponse).where(
            ReconciliationResponse.dispute_id == dispute_id,
            ReconciliationResponse.agent_id == participant.id,
            ReconciliationResponse.good_id == payload.good_id,
            ReconciliationResponse.kind == "value",
        )
    ).first()
    if existing:
        existing.agreed = payload.choice != "keep"
        existing.value_amount = recorded
        session.add(existing)
    else:
        session.add(ReconciliationResponse(
            dispute_id=dispute_id, agent_id=participant.id, good_id=payload.good_id,
            kind="value", agreed=(payload.choice != "keep"), value_amount=recorded,
        ))
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                           event_type="ReconciliationResponded",
                           payload={"kind": "value", "good_id": payload.good_id, "choice": payload.choice, "value": recorded}))
    session.commit()
    return compute_reconciliation_items(session, dispute_id)


@router.post("/omitted")
def respond_omitted(dispute_id: int, payload: OmittedResponseIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Optionally state a valuation/preference for an item this party omitted."""
    dispute = can_access_dispute(dispute_id, user, session)
    participant = require_participant_role(get_participant(dispute_id, user, session), deny_roles=("mediator",))
    _editable(dispute)
    good = session.get(Good, payload.good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")

    existing = session.exec(
        select(ReconciliationResponse).where(
            ReconciliationResponse.dispute_id == dispute_id,
            ReconciliationResponse.agent_id == participant.id,
            ReconciliationResponse.good_id == payload.good_id,
            ReconciliationResponse.kind == "omitted",
        )
    ).first()
    if existing:
        existing.value_amount = payload.value_amount
        existing.stars = payload.stars
        session.add(existing)
    else:
        session.add(ReconciliationResponse(
            dispute_id=dispute_id, agent_id=participant.id, good_id=payload.good_id,
            kind="omitted", value_amount=payload.value_amount, stars=payload.stars,
        ))
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                           event_type="ReconciliationResponded", payload={"kind": "omitted", "good_id": payload.good_id}))
    session.commit()
    return compute_reconciliation_items(session, dispute_id)


@router.post("/finalize")
def finalize_reconciliation(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Close reconciliation and generate the (now uniquely-defined) proposal.

    Requires that every party has responded to every open item."""
    dispute = can_access_dispute(dispute_id, user, session)
    require_participant_role(get_participant(dispute_id, user, session), deny_roles=("mediator",))

    recon = compute_reconciliation_items(session, dispute_id)
    if recon.get("has_items") and not recon.get("complete"):
        raise HTTPException(
            status_code=409,
            detail="All parties must respond to every reconciliation item before generating the proposal.",
        )

    try:
        proposal = ensure_latest_proposal(session, dispute_id=dispute_id, actor_user_id=user.id, require_min_ready=2)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    # Notify all participants that a proposal is ready to review.
    try:
        from ..services.notifications import notify_dispute
        notify_dispute(
            session, dispute_id=dispute_id, type="ProposalReady",
            payload={"proposal_id": proposal.id}, actor_user_id=None,
        )
    except Exception:
        import logging; logging.getLogger("crea3.notify").warning("notify failed", exc_info=True)

    return {"ok": True, "dispute_status": dispute.status, "proposal_id": proposal.id}
