"""Tests for entitlement-share resolution (claimed vs assigned + normalization)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.reconciliation import resolve_entitlements


def _agent(aid, assigned, claimed=None, name=None):
    return {"id": aid, "entitlement_share": assigned, "claimed_entitlement_share": claimed, "name": name or f"A{aid}"}


def test_no_claims_uses_assigned():
    info = resolve_entitlements([_agent(1, 0.5), _agent(2, 0.5)])
    assert abs(info["shares"][1] - 0.5) < 1e-9
    assert info["has_mismatch"] is False


def test_conflicting_claims_normalize_and_flag():
    # both claim 60% -> sums to 120% -> normalized to 50/50, flagged
    info = resolve_entitlements([_agent(1, 0.5, 0.6), _agent(2, 0.5, 0.6)])
    assert abs(info["shares"][1] - 0.5) < 1e-9
    assert abs(info["shares"][2] - 0.5) < 1e-9
    assert info["has_mismatch"] is True
    assert info["normalized"] is True


def test_one_party_claims_more():
    # Mario claims 60 (assigned 50), Lucia claims 50 -> 60/50 normalized
    info = resolve_entitlements([_agent(1, 0.5, 0.6), _agent(2, 0.5, 0.5)])
    assert abs(info["shares"][1] - (0.6 / 1.1)) < 1e-6
    assert abs(info["shares"][2] - (0.5 / 1.1)) < 1e-6
    assert info["has_mismatch"] is True


def test_shares_always_sum_to_one():
    for agents in [
        [_agent(1, 0.5, 0.9), _agent(2, 0.5, 0.9)],
        [_agent(1, 0.3, None), _agent(2, 0.7, None)],
        [_agent(1, 0.5, 0.01), _agent(2, 0.5, 0.99)],
    ]:
        info = resolve_entitlements(agents)
        assert abs(sum(info["shares"].values()) - 1.0) < 1e-9
