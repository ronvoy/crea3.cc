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
  2. Items are awarded to the highest valuer. When two parties value an item
     the SAME (the common case after reconciliation, where a disputed value
     becomes the mean for both), the award is chosen jointly with the other
     equally-valued items so that (a) the balancing payment left after the
     divisible goods are split is as small as possible and (b) within that,
     the parties' PREFERENCES (stars) are honoured as much as possible.
     Let received_i be the sum of i's *own* valuations of the items i won.
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
    preference: Dict[Tuple[int, int], float] | None = None,
) -> GTResult:
    """Run the sealed-bids (Knaster) procedure, with optional divisible goods.

    value[(agent, good)] is agent's perceived monetary value of good.
    entitlement maps agent -> share in [0,1]; shares should sum to ~1.
    divisible_goods lists good ids that may be split into fractions; the engine
    chooses each fraction to balance the parties' entitlement-weighted shares,
    which reduces the cash transfer.
    preference[(agent, good)] is agent's declared preference strength for good
    (star rating; missing = 0). It never changes money: it only decides who
    receives an indivisible good that the parties value EQUALLY.
    """
    divisible = set(divisible_goods or [])
    pref = preference or {}

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

    indivisible_ids = [g for g in good_ids if g not in divisible]
    divisible_sorted = sorted(
        divisible, key=lambda x: -max(value.get((a, x), 0.0) for a in agent_ids) if agent_ids else 0
    )

    # ======================================================================
    # TWO PARTIES: a global search over the money-tied indivisibles, then a
    # preference-aware split of the divisibles, then the cash settlement.
    #
    # Money is primary: an indivisible good a party values strictly more is
    # theirs (Knaster efficiency). After reconciliation, though, both parties
    # usually carry the SAME value for a good, so most awards are "free" and a
    # greedy per-good choice (stars, then balance) can paint the engine into a
    # corner: e.g. a 4-vs-3 star edge on a plot of land tips one party so far
    # ahead that the whole divisible pool cannot compensate and cash must still
    # change hands. The free awards are therefore chosen TOGETHER, ranked by:
    #   1. the balancing payment that remains after the divisibles have done
    #      their best (lower is better — parties should exchange as little
    #      cash as possible; differences under 1% of the estate are ignored);
    #   2. star satisfaction: for each free indivisible, the winner's stars
    #      minus the loser's, plus for each divisible the preferring party's
    #      fraction weighted by the star contrast (higher is better);
    #   3. how balanced the indivisibles alone are (so the divisibles stay
    #      close to their preferred holders instead of absorbing a big gap);
    #   4. a fixed order, for determinism.
    # Divisibles, given the indivisible awards, start split in proportion to
    # the ratings (tie -> entitlement split); if a party is then BEHIND their
    # fair share, all their divisible shares are scaled up by one common factor
    # (preference ratios preserved, capped at 100%) until both sit at their
    # entitlement share or the pool runs out; the rest is cash.
    # ======================================================================
    fair_pre = {a: ent[a] * perceived_total[a] for a in agent_ids}

    def _stars(a: int, g: int) -> float:
        return float(pref.get((a, g), 0.0) or 0.0)

    if len(agent_ids) == 2:
        A, B = agent_ids[0], agent_ids[1]
        fixed: Dict[int, int] = {}
        free: List[int] = []
        for g in indivisible_ids:
            va_, vb_ = value.get((A, g), 0.0), value.get((B, g), 0.0)
            if va_ > vb_:
                fixed[g] = A
            elif vb_ > va_:
                fixed[g] = B
            else:
                free.append(g)

        dva = {g: value.get((A, g), 0.0) for g in divisible_sorted}
        dvb = {g: value.get((B, g), 0.0) for g in divisible_sorted}
        contrast = {g: _stars(A, g) - _stars(B, g) for g in divisible_sorted}
        estate = max(perceived_total.values()) if perceived_total else 0.0
        cash_unit = max(estate * 0.01, 1.0)

        def _split_divisibles(rec_a: float, rec_b: float) -> Dict[int, float]:
            """Fractions of each divisible good to A, given indivisible totals.

            Pass 1: every divisible good is split IN PROPORTION TO THE RATINGS
            (entitlement-weighted, so equal ratings give the entitlement split).
            Pass 2: if a party is still behind their fair share, ALL of that
            party's divisible shares are scaled up by ONE common factor (an asset
            that reaches 100% is capped and the remainder re-spread over the
            others), so the proportions between their shares — their preference
            ratios — are preserved and no single asset flips. What the pool
            cannot absorb is left for the cash settlement.
            """
            x: Dict[int, float] = {}
            for g in divisible_sorted:
                sa_, sb_ = _stars(A, g), _stars(B, g)
                wa, wb = ent[A] * sa_, ent[B] * sb_
                if dva[g] + dvb[g] <= 0 or wa + wb <= 0:
                    x[g] = ent[A]                  # no signal: split by entitlement
                else:
                    x[g] = wa / (wa + wb)
            if not divisible_sorted:
                return x

            ga = rec_a - fair_pre[A] + sum(x[g] * dva[g] for g in divisible_sorted)
            gb = rec_b - fair_pre[B] + sum((1.0 - x[g]) * dvb[g] for g in divisible_sorted)
            diff = ga - gb                        # >0: A ahead, B behind
            if abs(diff) <= 1e-9:
                return x

            behind_is_a = diff < 0
            # receiver's fraction per good; moving fraction d of good g to the
            # receiver shrinks |ga-gb| by d * (va+vb)
            recv = {g: (x[g] if behind_is_a else 1.0 - x[g]) for g in divisible_sorted}
            weight = {g: dva[g] + dvb[g] for g in divisible_sorted}
            remaining = abs(diff)
            active = [g for g in divisible_sorted if weight[g] > 0 and recv[g] < 1.0 - 1e-12]
            for _ in range(len(divisible_sorted) + 2):
                if remaining <= 1e-9 or not active:
                    break
                base = sum(recv[g] * weight[g] for g in active)
                if base > 1e-12:
                    # common factor k: sum (recv*k - recv) * weight == remaining
                    k = 1.0 + remaining / base
                    capped = [g for g in active if recv[g] * k >= 1.0]
                    if not capped:
                        for g in active:
                            recv[g] *= k
                        remaining = 0.0
                        break
                else:
                    # receiver holds nothing of the active goods (rated 0):
                    # spread by equal percentage points instead
                    pts = remaining / sum(weight[g] for g in active)
                    capped = [g for g in active if recv[g] + pts >= 1.0]
                    if not capped:
                        for g in active:
                            recv[g] += pts
                        remaining = 0.0
                        break
                for g in capped:
                    remaining -= (1.0 - recv[g]) * weight[g]
                    recv[g] = 1.0
                active = [g for g in active if g not in capped]
            for g in divisible_sorted:
                r = max(0.0, min(1.0, recv[g]))
                x[g] = r if behind_is_a else 1.0 - r
            return x

        def _evaluate(assign: Dict[int, int]) -> tuple:
            rec_a = sum(value.get((A, g), 0.0) for g, w in assign.items() if w == A)
            rec_b = sum(value.get((B, g), 0.0) for g, w in assign.items() if w == B)
            x = _split_divisibles(rec_a, rec_b)
            tot_a = rec_a + sum(x[g] * dva[g] for g in divisible_sorted)
            tot_b = rec_b + sum((1.0 - x[g]) * dvb[g] for g in divisible_sorted)
            sur_a, sur_b = tot_a - fair_pre[A], tot_b - fair_pre[B]
            pot_ = sur_a + sur_b
            cash_a = -sur_a + ent[A] * pot_
            satisfaction = sum(
                (_stars(w, g) - _stars(B if w == A else A, g)) for g, w in assign.items() if g in free
            ) + sum(
                abs(contrast[g]) * (x[g] if contrast[g] > 0 else (1.0 - x[g]))
                for g in divisible_sorted if contrast[g] != 0
            )
            pre_gap = abs((rec_a - fair_pre[A]) - (rec_b - fair_pre[B]))
            key = (
                round(abs(cash_a) / cash_unit),   # 1. balancing payment (1% buckets)
                -round(satisfaction, 6),          # 2. star satisfaction
                round(pre_gap, 2),                # 3. indivisibles alone balanced
                tuple(0 if assign[g] == A else 1 for g in free),  # 4. determinism
            )
            return key, x

        best_key = None
        best_assign: Dict[int, int] = {}
        best_x: Dict[int, float] = {}
        if len(free) <= 12:
            # exhaustive: every way to award the money-tied indivisibles
            for mask in range(1 << len(free)):
                assign = dict(fixed)
                for i, g in enumerate(free):
                    assign[g] = B if (mask >> i) & 1 else A
                key, x = _evaluate(assign)
                if best_key is None or key < best_key:
                    best_key, best_assign, best_x = key, assign, x
        else:
            # many tied goods: greedy start (stars, then balance), then improve
            # by single flips until no flip lowers the objective.
            assign = dict(fixed)
            rec = {A: sum(value.get((w, g), 0.0) for g, w in fixed.items() if w == A),
                   B: sum(value.get((w, g), 0.0) for g, w in fixed.items() if w == B)}
            for g in free:
                sa_, sb_ = _stars(A, g), _stars(B, g)
                if sa_ != sb_:
                    w = A if sa_ > sb_ else B
                else:
                    w = min((A, B), key=lambda p: (rec[p] / (ent[p] or 1e-9), -ent[p], p))
                assign[g] = w
                rec[w] += value.get((w, g), 0.0)
            best_key, best_x = _evaluate(assign)
            best_assign = assign
            improved, rounds = True, 0
            while improved and rounds < 50:
                improved, rounds = False, rounds + 1
                for g in free:
                    trial = dict(best_assign)
                    trial[g] = B if trial[g] == A else A
                    key, x = _evaluate(trial)
                    if key < best_key:
                        best_key, best_assign, best_x, improved = key, trial, x, True

        for g in indivisible_ids:
            w = best_assign[g]
            winner_by_good[g] = w
            fractions_by_good[g] = {a: (1.0 if a == w else 0.0) for a in agent_ids}
            received[w] += value.get((w, g), 0.0)
        for g in divisible_sorted:
            xa = max(0.0, min(1.0, best_x.get(g, ent[A])))
            fractions_by_good[g] = {A: xa, B: 1.0 - xa}
            received[A] += xa * dva[g]
            received[B] += (1.0 - xa) * dvb[g]
            # the party with the larger fraction is recorded as nominal "winner"
            winner_by_good[g] = A if xa >= 0.5 else B

    # ======================================================================
    # 1 or 3+ PARTIES: greedy per-good awards (highest valuer; on equal money
    # more stars, then the party furthest below their share, then higher
    # entitlement, then lowest id) and divisibles split by entitlement.
    # ======================================================================
    else:
        def _tie_key(a: int, g: int) -> tuple:
            share = ent.get(a, 0.0) or 1e-9
            return (-_stars(a, g), received[a] / share, -(ent.get(a, 0.0)), a)

        for g in indivisible_ids:
            best_v = None
            candidates: List[int] = []
            for a in agent_ids:
                v = value.get((a, g), 0.0)
                if best_v is None or v > best_v:
                    best_v, candidates = v, [a]
                elif v == best_v:
                    candidates.append(a)
            best_a = min(candidates, key=lambda a: _tie_key(a, g)) if candidates else None
            if best_a is not None:
                winner_by_good[g] = best_a
                fractions_by_good[g] = {a: (1.0 if a == best_a else 0.0) for a in agent_ids}
                received[best_a] += value.get((best_a, g), 0.0)

        for g in divisible_sorted:
            if not agent_ids:
                break
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
        "party who values it most; equally-valued assets are placed so that the balancing payment is "
        "as small as possible and, within that, each goes to the party who rated it higher; divisible "
        "assets are split in proportion to the ratings, then the party behind has all their shares scaled "
        "up by one common factor (preference ratios preserved) so each party's total matches their "
        "entitlement share; and a "
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
