from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Dict, List, Tuple

from sqlmodel import Session, select

from ..models import AllocationProposal, AuditEvent, Dispute, DisputeAgent, Good, Preference

ALGO_VERSION = "v6-knaster-consistent-allocation"


def _stable_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash_inputs(inputs: Dict[str, Any]) -> str:
    # Include the algorithm version so that fixing/altering the algorithm yields a
    # different hash — otherwise a previously-cached proposal (same inputs) would be
    # served and the change would never take effect for existing disputes.
    return sha256(_stable_json({"algo": ALGO_VERSION, "inputs": inputs}).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ProposalBuildResult:
    inputs: Dict[str, Any]
    inputs_hash: str
    outputs: Dict[str, Any]
    metrics: Dict[str, Any]
    explanation: str
    algorithm_version: str = ALGO_VERSION


# ---------------------------------------------------------------------------
# Input loading
# ---------------------------------------------------------------------------

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
    # Exclude mediators from allocation inputs.
    agents = [a for a in agents if (a.role_in_dispute or "agent").lower() != "mediator"]

    prefs = session.exec(
        select(Preference).where(Preference.dispute_id == dispute_id)
    ).all()

    inputs: Dict[str, Any] = {
        "dispute": {"id": dispute.id, "method": "rates", "status": dispute.status},
        "goods": [
            {
                "id": g.id,
                "name": g.name,
                "estimated_value": float(g.estimated_value or 0.0),
                "indivisible": bool(g.indivisible),
                "divisible": bool(getattr(g, "divisible", False)),
                "party_divisible": dict((g.meta or {}).get("party_divisible") or {}),
                "created_by_agent_id": (g.meta or {}).get("created_by_agent_id"),
            }
            for g in goods
        ],
        "agents": [
            {
                "id": a.id,
                "name": a.name,
                "email": a.email,
                "entitlement_share": float(a.entitlement_share or 0.0),
                "claimed_entitlement_share": (
                    float(a.claimed_entitlement_share)
                    if getattr(a, "claimed_entitlement_share", None) is not None else None
                ),
                "entitlement_position": getattr(a, "entitlement_position", None),
            }
            for a in agents
        ],
        # Each preference carries the party's STAR rating and, when provided,
        # their own subjective VALUATION of the good (stored in bid_amount).
        "preferences": [
            {
                "agent_id": p.agent_id,
                "good_id": p.good_id,
                "stars": int(p.stars) if p.stars is not None else None,
                "value_amount": float(p.bid_amount) if p.bid_amount is not None else None,
            }
            for p in prefs
        ],
    }
    return inputs


def _agent_has_rated_all(*, good_ids: List[int], agent_id: int, prefs: List[Dict[str, Any]]) -> bool:
    rated = {p["good_id"] for p in prefs if p.get("agent_id") == agent_id and p.get("stars") is not None}
    return bool(good_ids) and all(gid in rated for gid in good_ids)


def compute_ready_agents_count(session: Session, dispute_id: int) -> int:
    inputs = _load_dispute_inputs(session, dispute_id)
    good_ids = [g["id"] for g in inputs["goods"] if g.get("id") is not None]
    agent_ids = [a["id"] for a in inputs["agents"] if a.get("id") is not None]
    prefs = inputs["preferences"]
    return sum(1 for aid in agent_ids if _agent_has_rated_all(good_ids=good_ids, agent_id=aid, prefs=prefs))


# ---------------------------------------------------------------------------
# Subjective valuations
# ---------------------------------------------------------------------------

def _acknowledged(agent_id: int, gid: int, prefs_by_ag: Dict[Tuple[int, int], Dict[str, Any]]) -> bool:
    """Did this party engage with this good at all? A party "acknowledges" a good
    when they submitted a preference for it with either a star rating or an
    explicit valuation. No row (or an empty row) means they did NOT include it."""
    pref = prefs_by_ag.get((agent_id, gid))
    if pref is None:
        return False
    return pref.get("stars") is not None or pref.get("value_amount") is not None


def _subjective_value(
    *,
    agent_id: int,
    good: Dict[str, Any],
    prefs_by_ag: Dict[Tuple[int, int], Dict[str, Any]],
    any_party_acknowledged: bool,
) -> float:
    """A party's monetary valuation of a good.

    IMPORTANT — trustworthy numbers: every monetary figure used by the engine is a
    value a user actually entered. We never fabricate euros from star ratings.

    Preference order:
      1. An explicit valuation the party entered for this good (value_amount).
      2. Otherwise the good's estimated value (a real number entered when the good
         was created). Stars express PREFERENCE (who wants the good) and are used
         only for tie-breaking contested indivisible goods — never converted into
         a monetary amount.
      3. If this party did NOT acknowledge the good *but another party did*
         (a disclosure asymmetry / omitted asset), this party's valuation is 0:
         they did not claim it. The asset is flagged separately.
      4. If NO party acknowledged the good, fall back to the estimated value so the
         allocation still works.
    """
    gid = good["id"]
    est = float(good.get("estimated_value") or 0.0)
    pref = prefs_by_ag.get((agent_id, gid))
    if pref is not None and pref.get("value_amount") is not None:
        # The party entered an explicit monetary valuation — use it verbatim.
        return float(pref["value_amount"])
    if pref is not None and pref.get("stars") is not None:
        # The party expressed a preference (stars) but no monetary value: the
        # asset's monetary worth is its estimated value (a real, entered number).
        # Stars do NOT change the money; they only break ties on who receives a
        # contested indivisible good (handled in build_proposal).
        return est
    # No usable signal from this party for this good.
    if any_party_acknowledged:
        return 0.0  # omitted by this party while another party claimed it
    return est  # nobody gave input -> neutral estimated value


# ---------------------------------------------------------------------------
# Equitable allocation with divergent valuations
# ---------------------------------------------------------------------------

def build_proposal(session: Session, dispute_id: int) -> ProposalBuildResult:
    inputs = _load_dispute_inputs(session, dispute_id)
    goods = inputs["goods"]
    agents = inputs["agents"]
    prefs = inputs["preferences"]

    goods_by_id = {g["id"]: g for g in goods if g.get("id") is not None}
    agents_by_id = {a["id"]: a for a in agents if a.get("id") is not None}
    good_ids = list(goods_by_id.keys())
    agent_ids = list(agents_by_id.keys())

    prefs_by_ag: Dict[Tuple[int, int], Dict[str, Any]] = {
        (int(p["agent_id"]), int(p["good_id"])): p for p in prefs
    }
    # Raw pre-reconciliation valuations ("set values") per (agent, good).
    pref_bid: Dict[Tuple[int, int], Any] = {
        k: v.get("value_amount") for k, v in prefs_by_ag.items()
    }

    # Which parties acknowledged each good, and whether ANY party did.
    acknowledged_by: Dict[int, List[int]] = {}
    any_ack: Dict[int, bool] = {}
    for gid in good_ids:
        ack = [aid for aid in agent_ids if _acknowledged(aid, gid, prefs_by_ag)]
        acknowledged_by[gid] = ack
        any_ack[gid] = len(ack) > 0

    # ---- Reconciled valuation matrix ----
    # The valuations used by the algorithm are the FINAL (reconciled) ones: where
    # both parties agreed to reconcile a divergent valuation we use the mean;
    # where a party valued an omitted item during reconciliation we use that;
    # otherwise the party's own valuation (with the spread preserved).
    from ..reconciliation import (
        compute_reconciliation_items,
        reconciled_valuation,
        _creator_of,
    )
    from ..models import Good as _Good, Preference as _Pref, ReconciliationResponse as _RR

    recon = compute_reconciliation_items(session, dispute_id)
    value_items_index = {it["good_id"]: it for it in recon["value_items"]}
    omitted_index = {it["good_id"]: it for it in recon["omitted_items"]}

    good_objs = {g.id: g for g in session.exec(select(_Good).where(_Good.dispute_id == dispute_id)).all()}
    pref_objs = {(p.agent_id, p.good_id): p for p in session.exec(select(_Pref).where(_Pref.dispute_id == dispute_id)).all()}
    rr_objs = {(r.agent_id, r.good_id, r.kind): r for r in session.exec(select(_RR).where(_RR.dispute_id == dispute_id)).all()}
    creator_by = {gid: _creator_of(good_objs[gid], agent_ids, pref_objs) for gid in good_ids if gid in good_objs}

    value: Dict[Tuple[int, int], float] = {}
    for aid in agent_ids:
        for gid in good_ids:
            g_obj = good_objs.get(gid)
            if g_obj is None:
                value[(aid, gid)] = 0.0
                continue
            value[(aid, gid)] = reconciled_valuation(
                agent_id=aid,
                good=g_obj,
                pref=pref_objs.get((aid, gid)),
                value_items_index=value_items_index,
                omitted_index=omitted_index,
                responses_index=rr_objs,
                any_ack=any_ack[gid],
                creator_id=creator_by.get(gid),
            )

    # ---- Entitlement shares (with claimed-vs-assigned mismatch handling) ----
    # Each party may claim their own share; if claims conflict or don't sum to 1,
    # they are normalized proportionally and the mismatch is flagged.
    from ..reconciliation import resolve_entitlements
    ent_info = resolve_entitlements([agents_by_id[aid] for aid in agent_ids])
    entitlement = {aid: ent_info["shares"].get(aid, 0.0) for aid in agent_ids}
    if not entitlement or sum(entitlement.values()) <= 0:
        entitlement = {aid: 1.0 / len(agent_ids) for aid in agent_ids} if agent_ids else {}

    # ---- Step 1: assign each good to the party who values it most (their own
    # valuation in money). When two parties value a good equally (e.g. both use
    # the estimated value), the party who expressed the stronger PREFERENCE
    # (more stars) receives it; remaining ties break by entitlement then lowest
    # id. Stars affect only WHO gets a contested good, never the monetary value.
    allocations: List[Dict[str, Any]] = []
    raw_value_by_agent: Dict[int, float] = {aid: 0.0 for aid in agent_ids}
    valuation_gap_total = 0.0
    omitted_assets: List[Dict[str, Any]] = []

    def _stars_for(aid: int, gid: int) -> int:
        p = prefs_by_ag.get((aid, gid))
        try:
            return int(p["stars"]) if p is not None and p.get("stars") is not None else 0
        except (TypeError, ValueError):
            return 0

    for gid in good_ids:
        good = goods_by_id[gid]
        best_aid = None
        best_val = -1.0
        for aid in agent_ids:
            v = value[(aid, gid)]
            if best_aid is None or v > best_val:
                best_aid, best_val = aid, v
            elif v == best_val:
                # Tie on money -> prefer stronger preference (stars), then higher
                # entitlement, then lowest id (stable, deterministic).
                cur_stars, new_stars = _stars_for(best_aid, gid), _stars_for(aid, gid)
                if new_stars > cur_stars:
                    best_aid, best_val = aid, v
                elif new_stars == cur_stars and (
                    entitlement.get(aid, 0) > entitlement.get(best_aid, 0)
                    or (entitlement.get(aid, 0) == entitlement.get(best_aid, 0) and aid < best_aid)
                ):
                    best_aid, best_val = aid, v

        # Valuations by every party for transparency (the gap).
        per_party_vals = {str(aid): round(value[(aid, gid)], 2) for aid in agent_ids}
        vals_only = [value[(aid, gid)] for aid in agent_ids]
        gap = (max(vals_only) - min(vals_only)) if len(vals_only) >= 2 else 0.0
        valuation_gap_total += gap

        if best_aid is not None:
            raw_value_by_agent[best_aid] += value[(best_aid, gid)]

        # Disclosure asymmetry: at least one party acknowledged the good, at
        # least one did not -> "contested by omission".
        ack = acknowledged_by.get(gid, [])
        omitted_by_ids = [aid for aid in agent_ids if aid not in ack]
        contested_by_omission = len(ack) > 0 and len(omitted_by_ids) > 0

        if contested_by_omission:
            omitted_assets.append({
                "good_id": gid,
                "good_name": good.get("name"),
                "estimated_value": float(good.get("estimated_value") or 0.0),
                "acknowledged_by_ids": list(ack),
                "acknowledged_by_names": [agents_by_id[a]["name"] for a in ack if a in agents_by_id],
                "omitted_by_ids": list(omitted_by_ids),
                "omitted_by_names": [agents_by_id[a]["name"] for a in omitted_by_ids if a in agents_by_id],
            })

        # Was this good's divergent valuation settled by its creator?
        reconciled_to_mean = False
        reconciled_value = None
        if gid in value_items_index:
            _it = value_items_index[gid]
            if _it.get("settled_to_mean") and _it.get("settled_value") is not None:
                reconciled_to_mean = True
                reconciled_value = _it.get("settled_value")

        # RAW "set values": each party's own pre-reconciliation valuation
        # (Preference.bid_amount; None when they never priced this good).
        raw_set_vals = {
            str(aid): (round(float(pref_bid[(aid, gid)]), 2) if pref_bid.get((aid, gid)) is not None else None)
            for aid in agent_ids
        }
        # PERCEIVED value: the value both parties agreed during reconciliation —
        # a common settled value if they converged, otherwise the mean of the
        # conflicting valuations (the default), otherwise the single/ref value.
        if reconciled_to_mean and reconciled_value is not None:
            perceived = round(float(reconciled_value), 2)
        elif gid in value_items_index and value_items_index[gid].get("mean") is not None:
            perceived = round(float(value_items_index[gid]["mean"]), 2)
        else:
            _raw = [v for v in raw_set_vals.values() if v is not None]
            perceived = round(sum(_raw) / len(_raw), 2) if _raw else float(good.get("estimated_value") or 0.0)

        # Who first entered this asset in the Goods section.
        _init_aid = good.get("created_by_agent_id")
        if _init_aid is None:
            _init_aid = creator_by.get(gid)
        # The price each agent RECORDED during the reconciliation step (their
        # mean/keep/other choice); None when the good had no value disagreement.
        _recon_resp = (value_items_index.get(gid) or {}).get("responses") or {}
        party_reconciled = {str(aid): _recon_resp.get(str(aid)) for aid in agent_ids}

        allocations.append({
            "good_id": gid,
            "good_name": good.get("name"),
            "assigned_agent_id": best_aid,
            "assigned_agent_name": agents_by_id[best_aid]["name"] if best_aid in agents_by_id else None,
            "initialized_by_id": _init_aid,
            "initialized_by_name": agents_by_id.get(_init_aid, {}).get("name") if _init_aid is not None else None,
            "estimated_value": float(good.get("estimated_value") or 0.0),
            "party_set_values": raw_set_vals,
            "party_reconciled": party_reconciled,
            "party_divisible": {str(aid): (good.get("party_divisible") or {}).get(str(aid)) for aid in agent_ids},
            "perceived_value": perceived,
            # winner's own valuation of this good
            "assigned_value": round(value[(best_aid, gid)], 2) if best_aid is not None else 0.0,
            # full transparency on how each party valued it (NOT their stars)
            "party_valuations": per_party_vals,
            "valuation_gap": round(gap, 2),
            "reconciled_to_mean": reconciled_to_mean,
            "reconciled_value": reconciled_value,
            # disclosure-asymmetry flags
            "contested_by_omission": contested_by_omission,
            "acknowledged_by_ids": list(ack),
            "omitted_by_ids": list(omitted_by_ids) if contested_by_omission else [],
            "omitted_by_names": [agents_by_id[a]["name"] for a in omitted_by_ids if a in agents_by_id] if contested_by_omission else [],
        })

    # ---- Step 2: game-theoretic cash settlement (Knaster sealed bids). ----
    # The allocation above (each asset to its highest valuer) is efficient; the
    # Knaster procedure now computes a cash settlement that makes the outcome
    # EQUITABLE - every party ends with the same advantage over their own
    # perceived fair share - using the parties' perceived values directly.
    from ..game_theory import allocate_knaster

    # ALL declared goods enter the balancing computation. A good that only one
    # party valued is still part of that party's declared estate. Divisible goods
    # are split by the engine to balance shares and reduce the cash transfer.
    divisible_good_ids = [gid for gid in good_ids if bool(goods_by_id[gid].get("divisible"))]
    gt = allocate_knaster(
        agent_ids=agent_ids,
        good_ids=good_ids,
        value=value,
        entitlement=entitlement,
        divisible_goods=divisible_good_ids,
    )

    # The engine is the SINGLE source of truth for WHO receives each asset.
    # Re-derive each good's award and each party's received value from it so the
    # allocation table and the fairness summary can never disagree. (Previously the
    # displayed allocation came from a separate "highest valuer" pass whose
    # tie-breaking could award every equally-valued asset to one party, while the
    # settlement below assumed the engine's balanced split — producing a report
    # that contradicted itself and an inverted balancing payment.)
    for _al in allocations:
        _gid = _al.get("good_id")
        _w = gt.winner_by_good.get(_gid)
        _al["assigned_agent_id"] = _w
        _al["assigned_agent_name"] = agents_by_id[_w]["name"] if _w in agents_by_id else None
        _al["assigned_value"] = round(value[(_w, _gid)], 2) if _w is not None else 0.0
    raw_value_by_agent = {aid: round(gt.received_by_agent.get(aid, 0.0), 2) for aid in agent_ids}

    compensation: Dict[str, float] = {str(a): gt.cash_by_agent.get(a, 0.0) for a in agent_ids}
    equalized_value_by_agent: Dict[str, float] = {
        str(a): round(gt.received_by_agent.get(a, 0.0) + gt.cash_by_agent.get(a, 0.0), 2) for a in agent_ids
    }
    compensation_note = ""

    if gt.transfer is not None:
        payer_id, payee_id, amt = gt.transfer
        if amt > 0.005:
            compensation_note = (
                f"To balance the assets, the proposal sets a balancing amount of \u20ac{amt:,.0f} "
                f"between the parties."
            )
        else:
            compensation_note = "The assets are already balanced; no balancing amount is needed."

    # Enrich allocations with divisible-split info now that the engine has run.
    for al in allocations:
        gid = al.get("good_id")
        is_div = bool(goods_by_id.get(gid, {}).get("divisible"))
        al["divisible"] = is_div
        if is_div:
            fr = gt.fractions_by_good.get(gid, {})
            al["fractions"] = {str(a): round(fr.get(a, 0.0), 4) for a in agent_ids}
            al["fraction_by_name"] = {
                (agents_by_id[a]["name"] if a in agents_by_id else str(a)): round(fr.get(a, 0.0), 4)
                for a in agent_ids
            }

    # ---- Safety net: the displayed allocation and the equity/settlement MUST be
    # derived from the SAME engine result. Recompute each party's received value
    # from the awards actually shown (indivisible winner + divisible fractions) and
    # require it to equal the engine's received_by_agent. This makes it impossible
    # to store a proposal whose "Awarded to" table contradicts its fairness figures
    # (the defect that produced an all-to-one-party table with a mismatched payment).
    _shown_received = {aid: 0.0 for aid in agent_ids}
    for al in allocations:
        gid = al.get("good_id")
        if al.get("divisible"):
            fr = al.get("fractions", {}) or {}
            for a in agent_ids:
                _shown_received[a] += value[(a, gid)] * float(fr.get(str(a), 0.0))
        else:
            w = al.get("assigned_agent_id")
            if w is not None:
                _shown_received[w] += value[(w, gid)]
    for aid in agent_ids:
        if abs(_shown_received[aid] - float(gt.received_by_agent.get(aid, 0.0))) > 0.5:
            raise RuntimeError(
                "Allocation pipeline inconsistency: the displayed award for agent "
                f"{aid} implies received {_shown_received[aid]:.2f} but the settlement engine "
                f"computed {float(gt.received_by_agent.get(aid, 0.0)):.2f}. Refusing to build a "
                "self-contradictory proposal."
            )

    # ---- Objective (estimated-value) view, for the fairness summary table. ----
    obj_value_by_agent: Dict[str, float] = {str(aid): 0.0 for aid in agent_ids}
    for al in allocations:
        est = float(al.get("estimated_value") or 0.0)
        if al.get("divisible") and al.get("fractions"):
            for a in agent_ids:
                obj_value_by_agent[str(a)] += est * float(al["fractions"].get(str(a), 0.0))
        else:
            w = al.get("assigned_agent_id")
            if w is not None:
                obj_value_by_agent[str(w)] += est
    total_est = sum(float(g.get("estimated_value") or 0.0) for g in goods) or 0.0
    obj_share = {aid: (obj_value_by_agent[aid] / total_est if total_est > 0 else 0.0) for aid in obj_value_by_agent}
    deviation = {aid: obj_share[aid] - float(entitlement.get(int(aid), 0.0)) for aid in obj_share}

    metrics = {
        "algorithm": ALGO_VERSION,
        "goods_count": len(goods),
        "agents_count": len(agents),
        "total_estimated_value": total_est,
        # objective view
        "value_by_agent": obj_value_by_agent,
        "value_share_by_agent": obj_share,
        "deviation_vs_entitlement_share": deviation,
        # subjective / equitable view (the divergent-valuation story)
        "subjective_value_by_agent": {str(aid): round(raw_value_by_agent[aid], 2) for aid in agent_ids},
        "perceived_total_by_agent": {
            str(aid): round(sum(value[(aid, gid)] for gid in good_ids), 2) for aid in agent_ids
        },
        "compensation_by_agent": compensation,
        "equalized_value_by_agent": equalized_value_by_agent,
        "valuation_gap_total": round(valuation_gap_total, 2),
        "compensation_note": compensation_note,
        "entitlement_by_agent": {str(aid): round(entitlement.get(aid, 0.0), 4) for aid in agent_ids},
        # Entitlement-share mismatch (claimed vs assigned), normalized proportionally.
        "entitlement_mismatch": bool(ent_info.get("has_mismatch")),
        "entitlement_normalized": bool(ent_info.get("normalized")),
        "entitlement_shares_in_dispute": bool(ent_info.get("shares_in_dispute")),
        "entitlement_detail": ent_info.get("details", []),
        # Divisible goods and the fraction awarded to each party.
        "divisible_good_ids": list(divisible_good_ids),
        "fractions_by_good": {
            str(gid): {str(a): gt.fractions_by_good.get(gid, {}).get(a, 0.0) for a in agent_ids}
            for gid in good_ids
        },
        # Game-theoretic (Knaster) detail over PERCEIVED values.
        "gt_method": "knaster-sealed-bids",
        "gt_fair_share_by_agent": {str(a): gt.fair_share_by_agent.get(a, 0.0) for a in agent_ids},
        "gt_received_by_agent": {str(a): gt.received_by_agent.get(a, 0.0) for a in agent_ids},
        "gt_surplus_by_agent": {str(a): gt.surplus_by_agent.get(a, 0.0) for a in agent_ids},
        "gt_final_advantage_by_agent": {str(a): gt.final_advantage_by_agent.get(a, 0.0) for a in agent_ids},
        "gt_pot": gt.pot,
        # Disclosure asymmetry: assets one party acknowledged but another omitted.
        "omitted_assets": omitted_assets,
        "omitted_assets_count": len(omitted_assets),
        "omitted_assets_value": round(sum(o["estimated_value"] for o in omitted_assets), 2),
    }

    disclosure_note = ""
    if omitted_assets:
        names = ", ".join(o["good_name"] or f"asset #{o['good_id']}" for o in omitted_assets)
        disclosure_note = (
            f"{len(omitted_assets)} asset(s) were acknowledged by one party but not the other "
            f"({names}). These are flagged for review: a party that did not include an asset is treated "
            f"as assigning it no value, so it is awarded to the party who claimed it. The parties or the "
            f"mediator should confirm whether each omission was intentional."
        )
    metrics["disclosure_note"] = disclosure_note

    explanation = (
        "Equitable allocation by the Knaster method of sealed bids, a cooperative game-theory procedure "
        "for dividing indivisible assets among parties. Each asset's monetary value is the value entered "
        "for it (its estimated value, or an explicit amount a party stated); star ratings express each "
        "party's preference and never change an asset's monetary value. Each indivisible asset is awarded "
        "to the party who values it most; when both value it equally, the tie is broken to keep the overall "
        "division balanced, which minimises the balancing payment. Then "
        "a cash settlement is computed from the entered values so that, after payment, every party ends "
        "with the same advantage over their own fair share (their entitlement share of the total value). "
        "Where the parties declared different sets of assets, matched and mismatched (one-sided) assets "
        "are handled explicitly. Only the resulting allocation, the asset values, and the settlement are "
        "reported."
    )

    inputs_hash = _hash_inputs(inputs)
    outputs = {
        "allocations": allocations,
        "compensation_by_agent": compensation,
        "compensation_note": compensation_note,
        "omitted_assets": omitted_assets,
        "disclosure_note": disclosure_note,
    }

    return ProposalBuildResult(
        inputs=inputs,
        inputs_hash=inputs_hash,
        outputs=outputs,
        metrics=metrics,
        explanation=explanation,
        algorithm_version=ALGO_VERSION,
    )


# ---------------------------------------------------------------------------
# Persistence helpers (unchanged behavior)
# ---------------------------------------------------------------------------

def ensure_latest_proposal(
    session: Session,
    *,
    dispute_id: int,
    actor_user_id: int | None = None,
    require_min_ready: int = 2,
) -> AllocationProposal:
    dispute = session.get(Dispute, dispute_id)
    if not dispute:
        raise ValueError("Dispute not found")

    ready_count = compute_ready_agents_count(session, dispute_id)
    if ready_count < require_min_ready:
        raise ValueError(
            f"Not enough completed parties to generate a proposal (need {require_min_ready}, have {ready_count})."
        )

    # Gate: every party must have evaluated every good before we can move on.
    from ..reconciliation import all_goods_evaluated
    ok, missing = all_goods_evaluated(session, dispute_id)
    if not ok:
        who = ", ".join(sorted({m["agent_name"] for m in missing}))
        raise ValueError(
            "All parties must evaluate every asset before a proposal can be generated. "
            f"Still missing a valuation from: {who}."
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

    if dispute.status in ("draft", "collecting", "validating", "reconciling"):
        dispute.status = "proposed"
        session.add(dispute)

    session.add(AuditEvent(
        dispute_id=dispute_id,
        actor_user_id=actor_user_id,
        event_type="ProposalGenerated",
        payload={"inputs_hash": built.inputs_hash, "algorithm_version": built.algorithm_version},
    ))
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
    try:
        return ensure_latest_proposal(
            session,
            dispute_id=dispute_id,
            actor_user_id=actor_user_id,
            require_min_ready=require_min_ready,
        )
    except Exception:
        return None
