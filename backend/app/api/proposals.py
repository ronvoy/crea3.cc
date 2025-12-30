from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from hashlib import sha256
from typing import Dict, Any, List

from ..db import get_session
from ..models import (
    Dispute,
    DisputeAgent,
    Good,
    Preference,
    Strategy,
    AllocationProposal,
    Acceptance,
    AuditEvent,
    User,
)
from ..schemas import ProposalOut, AcceptIn
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/proposals", tags=["proposals"])


def _inputs_hash(payload: Dict[str, Any]) -> str:
    raw = sha256(repr(payload).encode("utf-8")).hexdigest()
    return raw


def _build_inputs(dispute_id: int, session: Session) -> Dict[str, Any]:
    dispute = session.get(Dispute, dispute_id)
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all()
    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    prefs = session.exec(select(Preference).where(Preference.dispute_id == dispute_id)).all()
    strategies = session.exec(select(Strategy).where(Strategy.dispute_id == dispute_id)).all()

    return {
        "dispute": {"id": dispute.id, "method": dispute.method, "status": dispute.status},
        "agents": [
            {
                "id": a.id,
                "email": a.email,
                "name": a.name,
                "share": a.share,
                "role": a.role_in_dispute,
                "invite_status": a.invite_status,
                "ready": a.ready,
            }
            for a in agents
        ],
        "goods": [
            {
                "id": g.id,
                "name": g.name,
                "estimated_value": g.estimated_value,
                "indivisible": g.indivisible,
                "meta": g.meta or {},
            }
            for g in goods
        ],
        "preferences": [
            {
                "id": p.id,
                "agent_id": p.agent_id,
                "good_id": p.good_id,
                "method": p.method,
                "score": p.score,
            }
            for p in prefs
        ],
        "strategies": [{"agent_id": s.agent_id, "text": s.text} for s in strategies],
    }


def _require_all_ready(agents: List[DisputeAgent]) -> None:
    blocking = []
    for a in agents:
        if (a.role_in_dispute or "agent") == "mediator":
            continue
        if a.invite_status != "joined":
            blocking.append({"agent_id": a.id, "email": a.email, "reason": "not_joined"})
        elif not a.ready:
            blocking.append({"agent_id": a.id, "email": a.email, "reason": "preferences_missing"})
    if blocking:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Proposal requires all parties to join and submit preferences.",
                "blocking": blocking,
            },
        )


def _compute_allocation(inputs: Dict[str, Any]) -> Dict[str, Any]:
    goods = inputs["goods"]
    agents = inputs["agents"]
    prefs = inputs["preferences"]

    # Map (good_id, agent_id) -> score
    pref_map: Dict[tuple[int, int], float] = {}
    for p in prefs:
        key = (int(p["good_id"]), int(p["agent_id"]))
        pref_map[key] = float(p["score"] or 0.0)

    allocations = []
    utility: Dict[int, float] = {int(a["id"]): 0.0 for a in agents}

    for g in goods:
        gid = int(g["id"])
        # choose best agent by score
        best_agent_id = None
        best_score = None
        for a in agents:
            if (a.get("role") or "agent") == "mediator":
                continue
            aid = int(a["id"])
            score = pref_map.get((gid, aid), 0.0)
            if best_score is None or score > best_score:
                best_score = score
                best_agent_id = aid

        if best_agent_id is None:
            continue

        allocations.append({"good_id": gid, "assigned_agent_id": best_agent_id})
        utility[best_agent_id] += float(best_score or 0.0)

    # Basic fairness metrics
    util_vals = list(utility.values()) or [0.0]
    metrics = {
        "utility_total": float(sum(util_vals)),
        "utility_min": float(min(util_vals)),
        "utility_max": float(max(util_vals)),
    }

    explanation = (
        "This proposal is computed by assigning each good to the party who expressed the highest "
        "preference score for that good (Bids/Rates). It is a baseline allocation intended for pilot use."
    )

    return {"allocations": allocations, "utility": utility, "metrics": metrics, "explanation": explanation}


@router.get("", response_model=list[ProposalOut])
def list_proposals(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    props = session.exec(
        select(AllocationProposal).where(AllocationProposal.dispute_id == dispute_id).order_by(AllocationProposal.id.desc())
    ).all()
    return [
        ProposalOut(
            id=p.id,
            dispute_id=p.dispute_id,
            algorithm_version=p.algorithm_version,
            outputs=p.outputs,
            metrics=p.metrics,
            explanation=p.explanation,
            created_at=p.created_at,
        )
        for p in props
    ]


@router.post("", response_model=ProposalOut)
def generate_proposal(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    # Only dispute creator/admin can generate
    if user.role != "admin" and dispute.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="Not permitted to generate a proposal")

    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all()
    _require_all_ready(agents)

    inputs = _build_inputs(dispute_id, session)
    ihash = _inputs_hash(inputs)

    existing = session.exec(
        select(AllocationProposal).where(
            AllocationProposal.dispute_id == dispute_id,
            AllocationProposal.inputs_hash == ihash,
        )
    ).first()
    if existing:
        return ProposalOut(
            id=existing.id,
            dispute_id=existing.dispute_id,
            algorithm_version=existing.algorithm_version,
            outputs=existing.outputs,
            metrics=existing.metrics,
            explanation=existing.explanation,
            created_at=existing.created_at,
        )

    result = _compute_allocation(inputs)

    proposal = AllocationProposal(
        dispute_id=dispute_id,
        algorithm_version="v12-baseline",
        inputs_hash=ihash,
        outputs={"allocations": result["allocations"], "utility": result["utility"]},
        metrics=result["metrics"],
        explanation=result["explanation"],
    )
    session.add(proposal)
    session.commit()
    session.refresh(proposal)

    # initialize acceptances
    for a in agents:
        if (a.role_in_dispute or "agent") == "mediator":
            continue
        session.add(Acceptance(proposal_id=proposal.id, agent_id=a.id, accepted=False))
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, action="proposal_generated", payload={"proposal_id": proposal.id}))
    # mark dispute status
    dispute.status = "proposed"
    session.add(dispute)
    session.commit()

    return ProposalOut(
        id=proposal.id,
        dispute_id=proposal.dispute_id,
        algorithm_version=proposal.algorithm_version,
        outputs=proposal.outputs,
        metrics=proposal.metrics,
        explanation=proposal.explanation,
        created_at=proposal.created_at,
    )


@router.post("/{proposal_id}/accept")
def accept_proposal(
    dispute_id: int,
    proposal_id: int,
    payload: AcceptIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    can_access_dispute(dispute_id, user, session)
    agent = session.exec(
        select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id, DisputeAgent.email == user.email)
    ).first()
    if not agent:
        raise HTTPException(status_code=403, detail="Only dispute parties may accept/decline")

    acc = session.exec(select(Acceptance).where(Acceptance.proposal_id == proposal_id, Acceptance.agent_id == agent.id)).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Acceptance row not found")

    acc.accepted = bool(payload.accepted)
    acc.comment = payload.comment
    session.add(acc)
    session.commit()

    # if all accepted -> mark dispute accepted
    all_acc = session.exec(select(Acceptance).where(Acceptance.proposal_id == proposal_id)).all()
    if all(a.accepted for a in all_acc) and all_acc:
        dispute = session.get(Dispute, dispute_id)
        if dispute:
            dispute.status = "accepted"
            session.add(dispute)
            session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, action="proposal_accepted_all", payload={"proposal_id": proposal_id}))
            session.commit()

    return {"ok": True}
