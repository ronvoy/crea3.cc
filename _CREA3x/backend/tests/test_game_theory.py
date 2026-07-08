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
    # party 1 pays 100k (half house) + 30k (half of the 60k declared asset) = 130k? No:
    # fair_1 = 0.5*260k = 130k, received_1 = 260k, surplus = 130k; pot redistribution
    # yields a 115k transfer. The asset IS evaluated in the balance.
    assert abs(r.cash_by_agent[1] + 115000) < 1.0


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
