"""Tests for the Knaster sealed-bids allocation engine.

Run with:  cd backend && python3 -m pytest tests/ -q
(These tests have no external dependencies and do not touch the database.)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.game_theory import allocate_knaster


def test_identical_valuations_split_evenly_with_no_cash():
    # Both parties value two items equally -> a clean 1-1 split, no transfer.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 11],
        value={(1, 10): 100000, (1, 11): 100000, (2, 10): 100000, (2, 11): 100000},
        entitlement={1: 0.5, 2: 0.5},
    )
    assert len(set(r.winner_by_good.values())) == 2  # one each
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 1.0


def test_divergent_valuations_are_equitable_and_zero_sum():
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 11, 12],
        value={(1, 10): 280000, (1, 11): 20000, (1, 12): 30000,
               (2, 10): 190000, (2, 11): 20000, (2, 12): 70000},
        entitlement={1: 0.5, 2: 0.5},
    )
    adv = list(r.final_advantage_by_agent.values())
    assert abs(adv[0] - adv[1]) < 0.01           # equal advantage = equitable
    assert abs(round(sum(r.cash_by_agent.values()), 2)) < 0.01  # cash nets to zero
    assert r.winner_by_good[10] == 1             # house to its higher valuer
    assert r.winner_by_good[12] == 2             # art to its higher valuer


def test_one_sided_asset_awarded_to_declarer_and_shifts_balance():
    # Both value the house at 200k; only party 1 declares a 60k asset.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 99],
        value={(1, 10): 200000, (1, 99): 60000, (2, 10): 200000, (2, 99): 0.0},
        entitlement={1: 0.5, 2: 0.5},
    )
    assert r.winner_by_good[99] == 1             # awarded to the declarer
    # The house is money-tied, so it is placed to minimise the payment: to
    # party 2. fair_1 = 0.5*260k = 130k, received_1 = 60k, surplus_1 = -70k;
    # fair_2 = 100k, received_2 = 200k, surplus_2 = +100k; pot = 30k ->
    # cash_1 = 70k + 15k = +85k. The one-sided asset IS evaluated in the balance.
    assert r.winner_by_good[10] == 2
    assert abs(r.cash_by_agent[1] - 85000) < 1.0
    assert abs(r.cash_by_agent[2] + 85000) < 1.0


def test_entitlement_weighting():
    # 70/30 entitlement, single contested item both value at 100k.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10],
        value={(1, 10): 100000, (2, 10): 100000},
        entitlement={1: 0.7, 2: 0.3},
    )
    # Item goes to party 1 (higher entitlement breaks the value tie among equal
    # current shares); party 2 receives their 30% = 30k in cash.
    assert abs(r.cash_by_agent[2] - 30000) < 1.0


def test_cash_always_nets_to_zero_random_like():
    # A few asymmetric scenarios: the settlement must never create/destroy money.
    scenarios = [
        {(1, 1): 50000, (1, 2): 80000, (2, 1): 90000, (2, 2): 10000},
        {(1, 1): 0, (1, 2): 120000, (2, 1): 60000, (2, 2): 60000},
    ]
    for val in scenarios:
        r = allocate_knaster(agent_ids=[1, 2], good_ids=[1, 2], value=val, entitlement={1: 0.5, 2: 0.5})
        assert abs(round(sum(r.cash_by_agent.values()), 2)) < 0.01


def test_divisible_good_splits_and_avoids_cash():
    # One divisible good both value equally -> ~50/50 split, no cash transfer.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10],
        value={(1, 10): 100000, (2, 10): 100000},
        entitlement={1: 0.5, 2: 0.5},
        divisible_goods=[10],
    )
    fr = r.fractions_by_good[10]
    assert abs(fr[1] - 0.5) < 0.01 and abs(fr[2] - 0.5) < 0.01
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 1.0


def test_divisible_good_absorbs_imbalance_from_indivisible():
    # Indivisible car to the party who values it; a divisible house then splits to
    # balance, so the cash transfer is near zero and advantage is equal.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 11],
        value={(1, 10): 300000, (1, 11): 20000, (2, 10): 300000, (2, 11): 10000},
        entitlement={1: 0.5, 2: 0.5},
        divisible_goods=[10],
    )
    assert r.winner_by_good[11] == 1                      # car to higher valuer
    adv = list(r.final_advantage_by_agent.values())
    assert abs(adv[0] - adv[1]) < 1.0                     # equitable
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 5000  # mostly absorbed by the split


def test_entitlement_weighting_with_divisible():
    # 70/30 entitlement, single divisible good both value at 100k:
    # split should track entitlement (70/30), no cash needed.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10],
        value={(1, 10): 100000, (2, 10): 100000},
        entitlement={1: 0.7, 2: 0.3},
        divisible_goods=[10],
    )
    fr = r.fractions_by_good[10]
    assert abs(fr[1] - 0.7) < 0.02 and abs(fr[2] - 0.3) < 0.02


def test_equal_values_go_to_the_party_with_more_stars():
    # After reconciliation both parties carry the SAME value for every good, so
    # money never decides. Each party's top-rated good must go to them when
    # that costs nothing in balancing cash.
    val = {(1, 10): 100000, (2, 10): 100000, (1, 11): 100000, (2, 11): 100000}
    stars = {(1, 10): 5, (2, 10): 1,   # party 1 wants 10
             (1, 11): 1, (2, 11): 5}   # party 2 wants 11
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 11], value=val,
        entitlement={1: 0.5, 2: 0.5}, preference=stars,
    )
    assert r.winner_by_good == {10: 1, 11: 2}
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 1.0


def test_equal_values_min_cash_beats_weaker_preference():
    # Three equally-valued goods: honouring EVERY star edge (10 and 11 to party
    # 1, 12 to party 2) would leave 200k vs 50k and a 75k payment. Giving the
    # 4-vs-2 good to party 2 cuts the payment to 25k, so the engine does that,
    # while each party still keeps the good they rated 5.
    val = {(1, 10): 100000, (2, 10): 100000, (1, 11): 100000, (2, 11): 100000,
           (1, 12): 50000, (2, 12): 50000}
    stars = {(1, 10): 5, (2, 10): 1, (1, 11): 4, (2, 11): 2, (1, 12): 1, (2, 12): 5}
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 11, 12], value=val,
        entitlement={1: 0.5, 2: 0.5}, preference=stars,
    )
    assert r.winner_by_good == {10: 1, 11: 2, 12: 2}
    assert r.transfer == (2, 1, 25000.0)


def test_stars_never_override_a_higher_valuation():
    # Money remains primary: a lower valuer does not win by rating higher.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10], value={(1, 10): 120000, (2, 10): 100000},
        entitlement={1: 0.5, 2: 0.5}, preference={(1, 10): 1, (2, 10): 5},
    )
    assert r.winner_by_good[10] == 1


def test_equal_stars_fall_back_to_balanced_split():
    # Same values, same stars -> the old balance tie-break still yields one each.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 11],
        value={(1, 10): 100000, (1, 11): 100000, (2, 10): 100000, (2, 11): 100000},
        entitlement={1: 0.5, 2: 0.5}, preference={(1, 10): 3, (2, 10): 3, (1, 11): 3, (2, 11): 3},
    )
    assert len(set(r.winner_by_good.values())) == 2


def test_divisible_assets_follow_preferences_within_entitlement():
    # Car (indivisible) to A. Two divisible assets of equal value: A wants the
    # cash, B wants the gold. A is ahead by the car, so A hands back just enough
    # CASH (their own asset) to reach 50/50 -- B keeps ALL the gold, and no
    # balancing payment is needed.
    val = {(1, 1): 50000, (2, 1): 50000,      # car
           (1, 2): 100000, (2, 2): 100000,    # cash
           (1, 3): 100000, (2, 3): 100000}    # gold
    stars = {(1, 1): 5, (2, 1): 1, (1, 2): 5, (2, 2): 1, (1, 3): 1, (2, 3): 5}
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[1, 2, 3], value=val, entitlement={1: 0.5, 2: 0.5},
        divisible_goods=[2, 3], preference=stars,
    )
    assert r.winner_by_good[1] == 1
    assert abs(r.fractions_by_good[2][1] - 0.75) < 0.01   # A keeps 75% of the cash
    assert abs(r.fractions_by_good[3][2] - 1.0) < 0.01    # B keeps all the gold
    assert r.received_by_agent[1] == r.received_by_agent[2] == 125000
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 1.0


def test_divisible_split_tracks_entitlement_when_preferences_equal():
    # 70/30 entitlement, two divisible assets rated the same by both:
    # each is split 70/30 and no cash changes hands.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[10, 11],
        value={(1, 10): 100000, (2, 10): 100000, (1, 11): 40000, (2, 11): 40000},
        entitlement={1: 0.7, 2: 0.3}, divisible_goods=[10, 11],
        preference={(1, 10): 3, (2, 10): 3, (1, 11): 3, (2, 11): 3},
    )
    for g in (10, 11):
        assert abs(r.fractions_by_good[g][1] - 0.7) < 0.01
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 1.0


def test_single_divisible_cannot_offset_large_indivisible():
    # House (indivisible, 300k) to A; only 100k of divisible cash exists. Even
    # though A rated the cash higher, matching the 50/50 entitlement requires
    # ALL the cash to go to B, and A still pays the remaining 100k.
    r = allocate_knaster(
        agent_ids=[1, 2], good_ids=[1, 2],
        value={(1, 1): 300000, (2, 1): 300000, (1, 2): 100000, (2, 2): 100000},
        entitlement={1: 0.5, 2: 0.5}, divisible_goods=[2],
        preference={(1, 1): 5, (2, 1): 2, (1, 2): 5, (2, 2): 1},
    )
    assert r.winner_by_good[1] == 1
    assert abs(r.fractions_by_good[2][2] - 1.0) < 0.01
    assert r.transfer == (1, 2, 100000.0)


def test_indivisible_awards_chosen_so_divisibles_can_balance():
    # Real case (dispute 37). Greedy star awards put party 49 76.6k ahead on
    # indivisibles; the divisible pool (48.2k) could not compensate, so it went
    # 100% to 48 AND 14k cash was still owed. Moving the land (a 4-vs-3 edge)
    # to 48 lets the Toyota split ~55/45 with NO cash at all.
    ids = [48, 49]
    val = {}
    for g, v in {48: 35500, 49: 47500, 50: 4750, 51: 725, 52: 850, 53: 132500, 54: 87500}.items():
        val[(48, g)] = val[(49, g)] = float(v)
    stars = {(48, 48): 3, (49, 48): 4, (48, 49): 2, (49, 49): 3, (48, 50): 4, (49, 50): 4,
             (48, 51): 5, (49, 51): 3, (48, 52): 3, (49, 52): 4, (48, 53): 4, (49, 53): 5,
             (48, 54): 5, (49, 54): 3}
    r = allocate_knaster(
        agent_ids=ids, good_ids=[48, 49, 50, 51, 52, 53, 54], value=val,
        entitlement={48: 0.5, 49: 0.5}, divisible_goods=[49, 51], preference=stars,
    )
    assert r.winner_by_good[54] == 48 and r.winner_by_good[53] == 49   # 5-star picks kept
    assert r.winner_by_good[48] == 48                                   # land moved to balance
    fr = r.fractions_by_good[49]
    assert 0.4 < fr[48] < 0.7 and 0.3 < fr[49] < 0.6                    # Toyota really split
    assert r.fractions_by_good[51][48] > 0.5                            # PS5 mostly to the 5-star party
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 500          # no meaningful cash


def test_divisibles_split_by_star_ratio_and_corrected_from_largest():
    # Real case (dispute 39): PS5 (indivisible) to ronvoy (5 vs 2). Gold 4k and
    # silver 12k are divisible; deepa rates both 5, ronvoy 4 and 3. Each starts
    # at its star ratio (gold 44/56, silver 38/62 for ronvoy/deepa) and the
    # correction toward 50/50 comes off SILVER (the largest), so gold stays
    # mostly deepa's and silver moves slightly toward ronvoy — no cash.
    R, D = 52, 53
    val = {}
    for g, v in {55: 4000, 56: 12000, 57: 875}.items():
        val[(R, g)] = val[(D, g)] = float(v)
    stars = {(R, 55): 4, (D, 55): 5, (R, 56): 3, (D, 56): 5, (R, 57): 5, (D, 57): 2}
    r = allocate_knaster(
        agent_ids=[R, D], good_ids=[55, 56, 57], value=val,
        entitlement={R: 0.5, D: 0.5}, divisible_goods=[55, 56], preference=stars,
    )
    assert r.winner_by_good[57] == R
    assert abs(r.fractions_by_good[55][D] - 5 / 9) < 0.01     # gold untouched, deepa keeps 56%
    assert 0.5 < r.fractions_by_good[56][D] < 0.625           # silver trimmed toward ronvoy
    assert abs(r.received_by_agent[R] - r.received_by_agent[D]) < 1.0
    assert sum(abs(v) for v in r.cash_by_agent.values()) < 1.0
