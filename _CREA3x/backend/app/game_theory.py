"""Game-theoretic equitable allocation over perceived values.

This module implements a rigorous two-party fair-division procedure for
indivisible goods with *divergent subjective valuations* and monetary
side-payments, grounded in cooperative game theory:

  * Knaster-Steinhaus procedure of sealed bids (a.k.a. the method of sealed
    bids), which is the classical solution for dividing indivisible items among
    parties who value them differently, using cash to equalize.
  * Combined with the efficiency principle of Adjusted Winner: every item is
    awarded to the party who values it most, which is Pareto-optimal for two
    parties and minimizes envy.

Why this is the right tool
--------------------------
Each party i has a *perceived value* v_i(g) for every asset g (declared as an
explicit amount, or derived from a star rating - see proposals_service). The
parties may also *declare different sets of assets* (matching vs mismatching).
A fair outcome must be:

  - Efficient: no reallocation makes one party better off without making the
    other worse off  ->  give each item to the party who values it most.
  - Proportional / equitable: each party should receive at least their
    entitlement share of value *as they themselves perceive it*  ->  use cash
    side-payments to equalize the proportion-of-own-perception.
  - Envy-free (for 2 parties, the sealed-bids outcome is): after the cash
    settlement neither party would prefer to swap their bundle+cash for the
    other's.

The Knaster procedure
---------------------
For each party i with entitlement s_i (shares sum to 1):

  1. Fair share (in i's own currency):     fair_i = s_i * V_i,
     where V_i = sum over all g of v_i(g)  (i's perceived value of EVERYTHING
     that was declared by anyone).
  2. Items are awarded to the highest valuer. Let received_i be the sum of
     i's *own* valuations of the items i won.
  3. Initial surplus (own currency):        surplus_i = received_i - fair_i.
  4. The surpluses are *paid into / drawn from* a common cash pot. Because the
     total of fair shares need not equal the total awarded value, there is a
     pot:                                     pot = sum_i surplus_i.
     The pot is then redistributed equally (by entitlement) so that every party
     ends with the SAME monetary advantage over their fair share.
  5. Each party's net cash:                  cash_i = -surplus_i + s_i * pot.
     A negative cash_i means i pays in; positive means i receives.

For two parties this reduces to a single transfer and is provably equitable:
both end with value (received_i + cash_i) - fair_i equal, i.e. the same bonus
above their own perceived fair share.

The module returns enough detail for a transparent report: each party's
perceived total, fair share, value received, surplus, the cash settlement, and
the final position.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple


@dataclass
class GTResult:
    # winner per good id (for divisible goods this is the party with the larger share)
    winner_by_good: Dict[int, int]
    # fraction of each good awarded to each agent: fractions_by_good[good][agent] in [0,1]
    fractions_by_good: Dict[int, Dict[int, float]]
    # each party's own valuation of what they received
    received_by_agent: Dict[int, float]
    # V_i: each party's perceived value of all declared assets
    perceived_total_by_agent: Dict[int, float]
    # fair_i = s_i * V_i  (in own currency)
    fair_share_by_agent: Dict[int, float]
    # surplus_i = received_i - fair_i (before cash)
    surplus_by_agent: Dict[int, float]
    # net cash settlement: negative = pays in, positive = receives
    cash_by_agent: Dict[int, float]
    # final position: (received_i + cash_i) - fair_i, equal across parties at optimum
    final_advantage_by_agent: Dict[int, float]
    # the single transfer description for two parties: (payer_id, payee_id, amount)
    transfer: Tuple[int, int, float] | None
    pot: float
    notes: List[str] = field(default_factory=list)


def allocate_knaster(
    *,
    agent_ids: List[int],
    good_ids: List[int],
    value: Dict[Tuple[int, int], float],
    entitlement: Dict[int, float],
    divisible_goods: List[int] | None = None,
) -> GTResult:
    """Run the sealed-bids (Knaster) procedure, with optional divisible goods.

    value[(agent, good)] is agent's perceived monetary value of good.
    entitlement maps agent -> share in [0,1]; shares should sum to ~1.
    divisible_goods lists good ids that may be split into fractions; the engine
    chooses each fraction to balance the parties' entitlement-weighted shares,
    which reduces the cash transfer.
    """
    divisible = set(divisible_goods or [])

    # --- normalize entitlement ---
    ent = {a: float(entitlement.get(a, 0.0)) for a in agent_ids}
    tot = sum(ent.values())
    if tot <= 0:
        ent = {a: 1.0 / len(agent_ids) for a in agent_ids} if agent_ids else {}
    elif abs(tot - 1.0) > 1e-9:
        ent = {a: v / tot for a, v in ent.items()}

    # --- Step 1: each party's perceived value of EVERYTHING declared ---
    # For a divisible good, "received" will be a fraction of the party's value of
    # it; the perceived TOTAL still counts the whole good at the party's value.
    perceived_total = {a: sum(value.get((a, g), 0.0) for g in good_ids) for a in agent_ids}

    fractions_by_good: Dict[int, Dict[int, float]] = {}
    winner_by_good: Dict[int, int] = {}
    received = {a: 0.0 for a in agent_ids}

    # --- Step 2a: award INDIVISIBLE items to the highest valuer ---
    # Tie-break: give to the party currently furthest below their
    # entitlement-weighted share of value, to keep the split balanced.
    def _tie_key(a: int) -> tuple:
        share = ent.get(a, 0.0) or 1e-9
        return (received[a] / share, -(ent.get(a, 0.0)), a)

    indivisible_ids = [g for g in good_ids if g not in divisible]
    for g in indivisible_ids:
        best_v = None
        candidates: List[int] = []
        for a in agent_ids:
            v = value.get((a, g), 0.0)
            if best_v is None or v > best_v:
                best_v, candidates = v, [a]
            elif v == best_v:
                candidates.append(a)
        best_a = min(candidates, key=_tie_key) if candidates else None
        if best_a is not None:
            winner_by_good[g] = best_a
            fractions_by_good[g] = {a: (1.0 if a == best_a else 0.0) for a in agent_ids}
            received[best_a] += value.get((best_a, g), 0.0)

    # --- Step 2b: split DIVISIBLE goods to balance entitlement-weighted shares ---
    # For two parties this has a clean closed form: choose the fraction x of the
    # good to party A (rest to B) so that, after adding it, both move toward an
    # equal advantage over their fair share. We greedily assign each divisible
    # good's fraction to the party most "behind", which for 2 parties yields the
    # share that equalizes the running gap as far as that good allows.
    fair_pre = {a: ent[a] * perceived_total[a] for a in agent_ids}
    for g in sorted(divisible, key=lambda x: -max(value.get((a, x), 0.0) for a in agent_ids) if agent_ids else 0):
        if not agent_ids:
            break
        if len(agent_ids) == 2:
            a, b = agent_ids[0], agent_ids[1]
            va, vb = value.get((a, g), 0.0), value.get((b, g), 0.0)
            # current gap of received vs fair share
            gap_a = received[a] - fair_pre[a]
            gap_b = received[b] - fair_pre[b]
            # Give the good (value va to A, vb to B) so as to equalize gaps.
            # If A gets fraction x: A's gap += x*va, B's gap += (1-x)*vb.
            # Set gap_a + x*va == gap_b + (1-x)*vb  ->  x = (gap_b - gap_a + vb)/(va+vb)
            denom = va + vb
            if denom <= 0:
                x = ent[a]  # neither values it; split by entitlement
            else:
                x = (gap_b - gap_a + vb) / denom
                x = max(0.0, min(1.0, x))
            fractions_by_good[g] = {a: x, b: 1.0 - x}
            received[a] += x * va
            received[b] += (1.0 - x) * vb
            # the party with the larger fraction is recorded as nominal "winner"
            winner_by_good[g] = a if x >= 0.5 else b
        else:
            # 3+ parties: split a divisible good by entitlement (simple, stable).
            fractions_by_good[g] = {a: ent[a] for a in agent_ids}
            for a in agent_ids:
                received[a] += ent[a] * value.get((a, g), 0.0)
            winner_by_good[g] = max(agent_ids, key=lambda a: ent[a])

    # --- Step 3: fair share & surplus in each party's own currency ---
    fair = {a: ent[a] * perceived_total[a] for a in agent_ids}
    surplus = {a: received[a] - fair[a] for a in agent_ids}

    # --- Step 4-5: cash settlement via the common pot ---
    pot = sum(surplus.values())
    cash = {a: -surplus[a] + ent[a] * pot for a in agent_ids}
    final_adv = {a: (received[a] + cash[a]) - fair[a] for a in agent_ids}

    # --- two-party single transfer description ---
    transfer = None
    if len(agent_ids) == 2:
        a, b = agent_ids[0], agent_ids[1]
        if cash[a] < 0:
            transfer = (a, b, round(-cash[a], 2))
        elif cash[b] < 0:
            transfer = (b, a, round(-cash[b], 2))
        else:
            transfer = (a, b, 0.0)

    notes: List[str] = []
    notes.append(
        "Allocation by the Knaster method of sealed bids: each indivisible asset is awarded to the "
        "party who values it most; divisible assets are split to balance the parties' shares; and a "
        "cash settlement equalizes each party's advantage over their own perceived fair share."
    )

    return GTResult(
        winner_by_good=winner_by_good,
        fractions_by_good={g: {a: round(fractions_by_good.get(g, {}).get(a, 0.0), 4) for a in agent_ids} for g in good_ids},
        received_by_agent={a: round(received[a], 2) for a in agent_ids},
        perceived_total_by_agent={a: round(perceived_total[a], 2) for a in agent_ids},
        fair_share_by_agent={a: round(fair[a], 2) for a in agent_ids},
        surplus_by_agent={a: round(surplus[a], 2) for a in agent_ids},
        cash_by_agent={a: round(cash[a], 2) for a in agent_ids},
        final_advantage_by_agent={a: round(final_adv[a], 2) for a in agent_ids},
        transfer=transfer,
        pot=round(pot, 2),
        notes=notes,
    )
