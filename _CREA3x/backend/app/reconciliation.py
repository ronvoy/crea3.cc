"""Pre-proposal reconciliation.

Before a proposal is generated, both parties are asked to reconcile the two
kinds of disagreement the platform detects from their raw inputs:

  1. VALUE disagreements - both parties valued the same good, but differently.
     Each party records the price they accept (the mean, the other side's
     price, or their own). The final price is decided by majority vote over the
     parties' prices — accepting the other side's price is a vote for it, the
     mean is neutral — and settles on the mean when the votes tie or nobody
     voted for a specific price (see _majority_price).

  2. OMITTED items - a good was acknowledged (rated/valued) by one party but not
     the other. The omitting party is asked to OPTIONALLY express their own
     valuation and/or star preference for it. If they provide one it is used;
     if they decline, they are treated as valuing it at 0 (as before) and the
     item stays flagged.

Once every joined non-mediator party has responded to every open item, the
dispute is "reconciled" and the resulting valuations are uniquely defined, so
the generated proposal is deterministic.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from sqlmodel import Session, select

from .models import (
    Dispute,
    DisputeAgent,
    Good,
    Preference,
    ReconciliationResponse,
)

# A relative gap below this is treated as "effectively equal" (no reconciliation
# needed) to avoid asking the parties about trivial rounding differences.
VALUE_EQ_TOL = 0.01


def _non_mediator_joined(session: Session, dispute_id: int) -> List[DisputeAgent]:
    agents = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.invite_status == "joined",
        )
    ).all()
    return [a for a in agents if (a.role_in_dispute or "agent").lower() != "mediator"]


def _explicit_value(p: Preference, good: Good) -> float | None:
    """The party's monetary valuation of a good.

    Trustworthy numbers: a star rating is a PREFERENCE signal, never a monetary
    amount. We return the party's explicit valuation if they entered one, else the
    good's estimated value (a real number entered at good creation) when the party
    expressed any signal (stars), else None when they gave no usable signal.
    """
    if p is None:
        return None
    if p.bid_amount is not None:
        return float(p.bid_amount)
    if p.stars is not None:
        # Stars express desire, not price: the monetary worth is the estimated value.
        return float(good.estimated_value or 0.0)
    return None


def _acknowledged(p: Preference | None) -> bool:
    return p is not None and (p.stars is not None or p.bid_amount is not None)


def _creator_of(good: Good, agent_ids: List[int], pref_by: Dict[Tuple[int, int], Preference]) -> int | None:
    """The party who created the good (i.e. entered it first).

    Recorded on the good's meta at creation. Falls back to the earliest valuer,
    then the first party, for goods created before this was tracked.
    """
    cid = (good.meta or {}).get("created_by_agent_id")
    if isinstance(cid, int) and cid in agent_ids:
        return cid
    dated = [(pref_by[(aid, good.id)].created_at, aid) for aid in agent_ids if (aid, good.id) in pref_by]
    if dated:
        dated.sort(key=lambda x: (x[0] is None, x[0]))
        return dated[0][1]
    return agent_ids[0] if agent_ids else None


def _agent_value(aid: int, good: Good, creator_id: int | None, pref: Preference | None) -> float | None:
    """A party's monetary value for a good.

    The creator always has one — the reference value set at creation, unless they
    later entered their own explicit value. A non-creator has one only if they
    entered an explicit value or expressed a star preference (worth = reference).
    """
    if pref is not None and pref.bid_amount is not None:
        return float(pref.bid_amount)
    if aid == creator_id:
        return float(good.estimated_value or 0.0)
    if pref is not None and pref.stars is not None:
        return float(good.estimated_value or 0.0)
    return None


def _majority_price(vals: Dict[int, float], mean: float, recorded: List[float]) -> Tuple[float, str]:
    """Final price of a divergent good once every party has recorded a value.

    Each recorded value is a VOTE: for the party price it matches (own or the
    other side's), or for itself if it is some other amount; a value equal to the
    mean is neutral. Returns (price, 'majority') when one price has strictly the
    most votes, otherwise (mean, 'mean').
    """
    prices = [round(float(v), 2) for v in vals.values()]
    votes: Dict[float, int] = {}
    for rv in recorded:
        match = next((p for p in prices if abs(rv - p) <= 0.01), None)
        if match is None and abs(rv - mean) <= 0.01:
            continue                          # the mean is a neutral vote
        key = match if match is not None else round(float(rv), 2)
        votes[key] = votes.get(key, 0) + 1
    if votes:
        top = max(votes.values())
        winners = [k for k, c in votes.items() if c == top]
        if len(winners) == 1:
            return winners[0], "majority"
    return round(float(mean), 2), "mean"


def compute_reconciliation_items(session: Session, dispute_id: int) -> Dict[str, Any]:
    """Return the open reconciliation items plus each party's response state.

    Shape:
      {
        "value_items":   [ {good_id, good_name, valuations:{agent_id:val}, mean, gap, responses:{agent_id:agreed|null}} ],
        "omitted_items": [ {good_id, good_name, estimated_value, acknowledged_by:[ids], omitted_by:[ids],
                            responses:{agent_id:{value_amount, stars} | null}} ],
        "agents": [ {id, name} ],
        "complete": bool,  # every party has responded to every item that concerns them
      }
    """
    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    goods_by_id = {g.id: g for g in goods}
    agents = _non_mediator_joined(session, dispute_id)
    agent_ids = [a.id for a in agents]

    prefs = session.exec(select(Preference).where(Preference.dispute_id == dispute_id)).all()
    pref_by: Dict[Tuple[int, int], Preference] = {(p.agent_id, p.good_id): p for p in prefs}

    responses = session.exec(
        select(ReconciliationResponse).where(ReconciliationResponse.dispute_id == dispute_id)
    ).all()
    resp_by: Dict[Tuple[int, int, str], ReconciliationResponse] = {
        (r.agent_id, r.good_id, r.kind): r for r in responses
    }

    value_items: List[Dict[str, Any]] = []
    omitted_items: List[Dict[str, Any]] = []
    complete = True

    for g in goods:
        gid = g.id
        creator = _creator_of(g, agent_ids, pref_by)
        # Each party's monetary value for this good (the creator always has one:
        # the reference value they set at creation).
        vals = {aid: _agent_value(aid, g, creator, pref_by.get((aid, gid))) for aid in agent_ids}
        vals = {aid: v for aid, v in vals.items() if v is not None}
        ack_ids = list(vals.keys())
        not_ack_ids = [aid for aid in agent_ids if aid not in vals]

        # VALUE disagreement — both parties valued the good differently. Each
        # party records the value THEY accept: the mean, the other party's value,
        # or their own (keep). Once everyone has responded the final price is
        # decided by MAJORITY VOTE over the parties' stated prices: a recorded
        # value equal to a party's price is a vote for that price (accepting the
        # other side's price adds a vote to it), a recorded value equal to the
        # mean is neutral. The price with the most votes wins; a tie between
        # prices (e.g. each accepted the other's) or no votes at all (both chose
        # the mean) settles on the mean. Examples, A says X and B says Y:
        #   A->Y, B->Y or mean  => Y      A->X, B->X or mean  => X
        #   A->Y, B->X          => mean   A->mean, B->mean    => mean
        #   A->X, B->Y (both keep) => mean (default).
        if len(vals) >= 2:
            vmax, vmin = max(vals.values()), min(vals.values())
            denom = max(abs(vmax), 1.0)
            if (vmax - vmin) / denom > VALUE_EQ_TOL:
                all_mean = round(sum(vals.values()) / len(vals), 2)
                item_resp: Dict[str, Any] = {}
                recorded: List[float] = []
                for aid in ack_ids:
                    r = resp_by.get((aid, gid, "value"))
                    if r is None or r.value_amount is None:
                        item_resp[str(aid)] = None
                        complete = False
                    else:
                        rv = round(float(r.value_amount), 2)
                        item_resp[str(aid)] = rv
                        recorded.append(rv)
                all_responded = all(item_resp[str(aid)] is not None for aid in ack_ids)
                settled, settled_value, settled_kind = False, None, None
                if all_responded and recorded:
                    settled_value, settled_kind = _majority_price(vals, all_mean, recorded)
                    settled = True
                value_items.append({
                    "good_id": gid,
                    "good_name": g.name,
                    "valuations": {str(aid): round(v, 2) for aid, v in vals.items()},
                    "mean": all_mean,
                    "gap": round(vmax - vmin, 2),
                    "responses": item_resp,          # {agent_id: recorded_value | None}
                    "settled_to_mean": settled,       # settled to a common (final) value
                    "settled_value": settled_value,
                    "settled_kind": settled_kind,     # 'majority' | 'mean' | None
                    "all_responded": all_responded,
                })

        if len(ack_ids) >= 1 and len(not_ack_ids) >= 1:
            # OMITTED item: the non-acknowledgers are asked to (optionally) value it.
            item_resp = {}
            for aid in not_ack_ids:
                r = resp_by.get((aid, gid, "omitted"))
                if r is None:
                    item_resp[str(aid)] = None
                    complete = False
                else:
                    item_resp[str(aid)] = {"value_amount": r.value_amount, "stars": r.stars}
            omitted_items.append({
                "good_id": gid,
                "good_name": g.name,
                "estimated_value": float(g.estimated_value or 0.0),
                "acknowledged_by": [a.id for a in agents if a.id in ack_ids],
                "acknowledged_by_names": [a.name for a in agents if a.id in ack_ids],
                "omitted_by": list(not_ack_ids),
                "omitted_by_names": [a.name for a in agents if a.id in not_ack_ids],
                "values_by_ack": {str(a): round(vals[a], 2) for a in ack_ids},
                "responses": item_resp,
            })

    return {
        "value_items": value_items,
        "omitted_items": omitted_items,
        "agents": [{"id": a.id, "name": a.name} for a in agents],
        "complete": complete,
        "has_items": bool(value_items) or bool(omitted_items),
    }


def reconciled_valuation(
    *,
    agent_id: int,
    good: Good,
    pref: Preference | None,
    value_items_index: Dict[int, Dict[str, Any]],
    omitted_index: Dict[int, Dict[str, Any]],
    responses_index: Dict[Tuple[int, int, str], ReconciliationResponse],
    any_ack: bool,
    creator_id: int | None = None,
) -> float:
    """The party's FINAL (reconciled) valuation of a good, used by the engine.

    Resolution rules:
      * If this good had a VALUE disagreement and ALL acknowledgers agreed to the
        mean, every acknowledger's reconciled value becomes the mean.
      * If this good was OMITTED by this party: use the valuation they supplied
        during reconciliation if any; otherwise 0 (unclaimed).
      * Otherwise the party's own explicit/derived valuation (unchanged).
    """
    gid = good.id

    # Omitted-by-this-party case.
    if gid in omitted_index and agent_id in omitted_index[gid]["omitted_by"]:
        r = responses_index.get((agent_id, gid, "omitted"))
        if r is not None and r.value_amount is not None:
            return float(r.value_amount)
        if r is not None and r.stars is not None:
            # Stars are a preference, not a price: use the estimated value.
            return float(good.estimated_value or 0.0)
        return 0.0  # declined to value -> unclaimed

    # Value-disagreement case: if ALL acknowledgers converged on a common value,
    # use it. Otherwise the PERCEIVED value defaults to the MEAN of the
    # conflicting valuations DIRECTLY (both parties' final value becomes the
    # mean — the spread never survives into the proposal).
    if gid in value_items_index:
        item = value_items_index[gid]
        if item.get("settled_to_mean") and item.get("settled_value") is not None:
            return float(item["settled_value"])
        if item.get("mean") is not None:
            return float(item["mean"])
        v = item.get("valuations", {}).get(str(agent_id))
        if v is not None:
            return float(v)

    # Default: the party's own value (the creator gets the reference value).
    base = _agent_value(agent_id, good, creator_id, pref)
    if base is not None:
        return base
    return 0.0 if any_ack else float(good.estimated_value or 0.0)


# ---------------------------------------------------------------------------
# "All goods evaluated by all parties" gate
# ---------------------------------------------------------------------------

def all_goods_evaluated(session: Session, dispute_id: int) -> Tuple[bool, List[Dict[str, Any]]]:
    """True when every joined non-mediator party has a value for every good.

    A party "has a value" for a good when they created it (reference value), gave
    an explicit valuation or star rating, or supplied a value during
    reconciliation (their own value, or accepting the estimate). Returns
    (ok, missing) where missing is a list of {agent_id, agent_name, good_id, good_name}.
    """
    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    agents = _non_mediator_joined(session, dispute_id)
    agent_ids = [a.id for a in agents]
    name_by = {a.id: a.name for a in agents}

    prefs = session.exec(select(Preference).where(Preference.dispute_id == dispute_id)).all()
    pref_by: Dict[Tuple[int, int], Preference] = {(p.agent_id, p.good_id): p for p in prefs}

    resp = session.exec(
        select(ReconciliationResponse).where(ReconciliationResponse.dispute_id == dispute_id)
    ).all()
    resp_has_value = {
        (r.agent_id, r.good_id)
        for r in resp
        if r.value_amount is not None and r.kind in ("value", "omitted")
    }

    missing: List[Dict[str, Any]] = []
    for g in goods:
        creator = _creator_of(g, agent_ids, pref_by)
        for aid in agent_ids:
            has = (
                _agent_value(aid, g, creator, pref_by.get((aid, g.id))) is not None
                or (aid, g.id) in resp_has_value
            )
            if not has:
                missing.append({
                    "agent_id": aid,
                    "agent_name": name_by.get(aid, f"#{aid}"),
                    "good_id": g.id,
                    "good_name": g.name,
                })
    return (len(missing) == 0, missing)




def resolve_entitlements(agents: list) -> dict:
    """Resolve each party's entitlement share, detecting and normalizing
    mismatches between what the dispute owner ASSIGNED and what each party CLAIMS.

    For each agent we take their CLAIMED share if they set one, otherwise the
    assigned share. If the resulting shares do not sum to 1 (e.g. both parties
    claim 60%), they are normalized proportionally so they do. A mismatch is
    reported when a party's claim differs from their assigned share, or when the
    claims needed normalizing.

    `agents` is a list of objects/dicts exposing: id, entitlement_share
    (assigned, 0..1), claimed_entitlement_share (0..1 or None), name.

    Returns:
      {
        "shares": {agent_id: normalized_share},
        "assigned": {agent_id: assigned_share},
        "effective_raw": {agent_id: claimed_or_assigned_before_norm},
        "has_mismatch": bool,
        "normalized": bool,             # claims didn't sum to 1
        "details": [ {agent_id, name, assigned, claimed, normalized_share} ],
      }
    """
    def _get(a, key, default=None):
        if isinstance(a, dict):
            return a.get(key, default)
        return getattr(a, key, default)

    ids = [int(_get(a, "id")) for a in agents]
    assigned = {int(_get(a, "id")): float(_get(a, "entitlement_share") or 0.0) for a in agents}
    claimed = {}
    for a in agents:
        aid = int(_get(a, "id"))
        c = _get(a, "claimed_entitlement_share", None)
        claimed[aid] = (float(c) if c is not None else None)

    # Effective declared value: the party's claim if they set one, else the
    # owner-assigned share.
    raw = {aid: (claimed[aid] if claimed[aid] is not None else assigned[aid]) for aid in ids}
    tot_raw = sum(raw.values())
    tot_assigned = sum(assigned.values())

    # A party whose claim differs from their assigned share is a mismatch.
    claim_mismatch = any(
        claimed[aid] is not None and abs(claimed[aid] - assigned[aid]) > 1e-6
        for aid in ids
    )

    shares_in_dispute = False
    if tot_raw > 0 and abs(tot_raw - 1.0) <= 1e-6:
        # The declared shares are internally consistent (sum to 100%): respect
        # them EXACTLY, with no rescaling.
        shares = dict(raw)
    else:
        # The declared shares conflict or do not sum to 100% (e.g. 60% + 50%).
        # We do NOT silently rescale them into invented percentages (52/48).
        # Instead we fall back to the owner-assigned shares — the authoritative
        # starting point, which sum to 100% — as a PROVISIONAL basis, and flag the
        # disagreement so the parties resolve it. The raw claims are preserved and
        # reported in full, never averaged away.
        shares_in_dispute = True
        if tot_assigned > 0 and abs(tot_assigned - 1.0) <= 1e-6:
            shares = dict(assigned)
        elif tot_assigned > 0:
            shares = {aid: assigned[aid] / tot_assigned for aid in ids}
        else:
            shares = {aid: 1.0 / len(ids) for aid in ids} if ids else {}

    normalized = False  # claims are never rescaled anymore

    details = []
    for a in agents:
        aid = int(_get(a, "id"))
        details.append({
            "agent_id": aid,
            "name": _get(a, "name"),
            "assigned": round(assigned[aid], 4),
            "claimed": (round(claimed[aid], 4) if claimed[aid] is not None else None),
            "normalized_share": round(shares.get(aid, 0.0), 4),
            "position": _get(a, "entitlement_position", None),
        })

    return {
        "shares": shares,
        "assigned": assigned,
        "effective_raw": raw,
        "has_mismatch": bool(claim_mismatch or shares_in_dispute),
        "normalized": False,
        "shares_in_dispute": bool(shares_in_dispute),
        "details": details,
    }
