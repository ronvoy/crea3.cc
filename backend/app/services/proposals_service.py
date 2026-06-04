from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Dict, List, Tuple

from sqlmodel import Session, select

from ..models import AllocationProposal, AuditEvent, Dispute, DisputeAgent, Good, Preference


def _stable_json(obj: Any) -> str:
    """Stable JSON serialization for hashing."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash_inputs(inputs: Dict[str, Any]) -> str:
    return sha256(_stable_json(inputs).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ProposalBuildResult:
    inputs: Dict[str, Any]
    inputs_hash: str
    outputs: Dict[str, Any]
    metrics: Dict[str, Any]
    explanation: str
    algorithm_version: str = "v1-rates-baseline"


def _load_dispute_inputs(session: Session, dispute_id: int) -> Dict[str, Any]:
    dispute = session.get(Dispute, dispute_id)
    if not dispute:
        raise ValueError("Dispute not found")

    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    agents = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.invite_status == "joined",
        )
    ).all()

    # Exclude mediators from allocation inputs
    agents = [a for a in agents if (a.role_in_dispute or "agent").lower() != "mediator"]

    prefs = session.exec(
        select(Preference).where(
            Preference.dispute_id == dispute_id,
            Preference.method == "rates",
        )
    ).all()

    inputs: Dict[str, Any] = {
        "dispute": {
            "id": dispute.id,
            "method": "rates",
            "status": dispute.status,
        },
        "goods": [
            {
                "id": g.id,
                "name": g.name,
                "estimated_value": float(g.estimated_value or 0.0),
                "indivisible": bool(g.indivisible),
            }
            for g in goods
        ],
        "agents": [
            {
                "id": a.id,
                "name": a.name,
                "email": a.email,
                "entitlement_share": float(a.entitlement_share or 0.0),
            }
            for a in agents
        ],
        "ratings": [
            {
                "agent_id": p.agent_id,
                "good_id": p.good_id,
                "stars": int(p.stars or 0),
            }
            for p in prefs
            if p.stars is not None
        ],
    }
    return inputs


def _agent_has_completed_ratings(
    *,
    dispute_goods_ids: List[int],
    agent_id: int,
    ratings: List[Dict[str, Any]],
) -> bool:
    rated_goods = {r["good_id"] for r in ratings if r.get("agent_id") == agent_id and r.get("stars") is not None}
    return bool(dispute_goods_ids) and all(gid in rated_goods for gid in dispute_goods_ids)


def compute_ready_agents_count(session: Session, dispute_id: int) -> int:
    """Count joined non-mediator agents who rated all goods."""
    inputs = _load_dispute_inputs(session, dispute_id)
    goods_ids = [g["id"] for g in inputs["goods"] if g.get("id") is not None]
    agent_ids = [a["id"] for a in inputs["agents"] if a.get("id") is not None]
    ratings = inputs["ratings"]

    ready = 0
    for aid in agent_ids:
        if _agent_has_completed_ratings(dispute_goods_ids=goods_ids, agent_id=aid, ratings=ratings):
            ready += 1
    return ready


def _pick_winner(
    *,
    good_id: int,
    agent_ids: List[int],
    ratings_by_agent_good: Dict[Tuple[int, int], int],
    entitlement_share_by_agent: Dict[int, float],
) -> Tuple[int | None, int]:
    """Return (agent_id, score). If no ratings exist, returns (None, 0)."""
    best_agent = None
    best_score = -1
    best_share = -1.0

    for aid in agent_ids:
        score = int(ratings_by_agent_good.get((aid, good_id), 0))
        share = float(entitlement_share_by_agent.get(aid, 0.0))
        if score > best_score:
            best_agent, best_score, best_share = aid, score, share
        elif score == best_score:
            # tie-breaker: higher entitlement_share, then lower agent id for determinism
            if share > best_share or (share == best_share and best_agent is not None and aid < best_agent):
                best_agent, best_score, best_share = aid, score, share

    if best_score <= 0:
        return None, 0
    return best_agent, best_score


def build_proposal(session: Session, dispute_id: int) -> ProposalBuildResult:
    inputs = _load_dispute_inputs(session, dispute_id)
    goods = inputs["goods"]
    agents = inputs["agents"]
    ratings = inputs["ratings"]

    goods_by_id = {g["id"]: g for g in goods if g.get("id") is not None}
    agents_by_id = {a["id"]: a for a in agents if a.get("id") is not None}

    goods_ids = list(goods_by_id.keys())
    agent_ids = list(agents_by_id.keys())

    ratings_by_agent_good: Dict[Tuple[int, int], int] = {}
    for r in ratings:
        aid = int(r["agent_id"])
        gid = int(r["good_id"])
        ratings_by_agent_good[(aid, gid)] = int(r.get("stars") or 0)

    entitlement_share_by_agent = {aid: float(agents_by_id[aid].get("entitlement_share") or 0.0) for aid in agent_ids}

    allocations: List[Dict[str, Any]] = []
    utility_by_agent: Dict[str, Any] = {str(aid): 0 for aid in agent_ids}
    value_by_agent: Dict[str, float] = {str(aid): 0.0 for aid in agent_ids}

    for gid in goods_ids:
        winner, score = _pick_winner(
            good_id=gid,
            agent_ids=agent_ids,
            ratings_by_agent_good=ratings_by_agent_good,
            entitlement_share_by_agent=entitlement_share_by_agent,
        )

        good = goods_by_id[gid]
        alloc = {
            "good_id": gid,
            "good_name": good.get("name"),
            "assigned_agent_id": winner,
            "assigned_agent_name": agents_by_id[winner]["name"] if winner is not None and winner in agents_by_id else None,
            # keep `score` for compatibility with existing report renderer
            "score": score,
            "stars": score,
            "method": "rates",
            "estimated_value": float(good.get("estimated_value") or 0.0),
        }
        allocations.append(alloc)

        if winner is not None:
            utility_by_agent[str(winner)] += int(score)
            value_by_agent[str(winner)] += float(good.get("estimated_value") or 0.0)

    total_value = sum(float(g.get("estimated_value") or 0.0) for g in goods) or 0.0
    value_share_by_agent: Dict[str, float] = {}
    deviation_vs_entitlement: Dict[str, float] = {}
    for aid_str, assigned_value in value_by_agent.items():
        share = (assigned_value / total_value) if total_value > 0 else 0.0
        value_share_by_agent[aid_str] = share
        entitlement = float(entitlement_share_by_agent.get(int(aid_str), 0.0))
        deviation_vs_entitlement[aid_str] = share - entitlement

    metrics = {
        "method": "rates",
        "goods_count": len(goods),
        "agents_count": len(agents),
        "total_score_assigned": sum(int(v) for v in utility_by_agent.values()),
        "utility_by_agent": utility_by_agent,
        "total_estimated_value": total_value,
        "value_by_agent": value_by_agent,
        "value_share_by_agent": value_share_by_agent,
        "deviation_vs_entitlement_share": deviation_vs_entitlement,
    }

    explanation = (
        "Baseline allocation (rates only): each good is assigned to the joined party with the highest star rating "
        "for that good. Ties are broken deterministically using entitlement_share and agent id."
    )

    inputs_hash = _hash_inputs(inputs)
    outputs = {"allocations": allocations, "utility": utility_by_agent}

    return ProposalBuildResult(
        inputs=inputs,
        inputs_hash=inputs_hash,
        outputs=outputs,
        metrics=metrics,
        explanation=explanation,
        algorithm_version="v1-rates-baseline",
    )


def ensure_latest_proposal(
    session: Session,
    *,
    dispute_id: int,
    actor_user_id: int | None = None,
    require_min_ready: int = 2,
) -> AllocationProposal:
    """Create (or reuse) the latest proposal based on current inputs.

    - Only uses `rates` preferences.
    - Requires at least `require_min_ready` joined non-mediator agents to have rated all goods.
    """
    dispute = session.get(Dispute, dispute_id)
    if not dispute:
        raise ValueError("Dispute not found")

    ready_count = compute_ready_agents_count(session, dispute_id)
    if ready_count < require_min_ready:
        raise ValueError(
            f"Not enough completed parties to generate a proposal (need {require_min_ready}, have {ready_count})."
        )

    built = build_proposal(session, dispute_id)

    existing = session.exec(
        select(AllocationProposal)
        .where(AllocationProposal.dispute_id == dispute_id, AllocationProposal.inputs_hash == built.inputs_hash)
        .order_by(AllocationProposal.created_at.desc())
    ).first()

    if existing:
        return existing

    proposal = AllocationProposal(
        dispute_id=dispute_id,
        algorithm_version=built.algorithm_version,
        inputs_hash=built.inputs_hash,
        outputs=built.outputs,
        metrics=built.metrics,
        explanation=built.explanation,
    )
    session.add(proposal)

    # Move dispute forward if applicable
    if dispute.status in ("draft", "collecting", "validating"):
        dispute.status = "proposed"
        session.add(dispute)

    session.add(
        AuditEvent(
            dispute_id=dispute_id,
            actor_user_id=actor_user_id,
            event_type="ProposalGenerated",
            payload={"inputs_hash": built.inputs_hash, "algorithm_version": built.algorithm_version},
        )
    )
    session.commit()
    session.refresh(proposal)
    return proposal


def maybe_generate_proposal(
    session: Session,
    *,
    dispute_id: int,
    actor_user_id: int | None = None,
    require_min_ready: int = 2,
) -> AllocationProposal | None:
    """Best-effort auto generation used by preferences submission."""
    try:
        return ensure_latest_proposal(
            session,
            dispute_id=dispute_id,
            actor_user_id=actor_user_id,
            require_min_ready=require_min_ready,
        )
    except Exception:
        return None
