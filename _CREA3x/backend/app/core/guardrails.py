"""Price guardrails for a party's own valuation of a good.

The party who ENTERED a good (the "initial person") sets its reference price.
Any OTHER party may value the same good differently, but only within a band:

  * the band is anchored on the reference price and, when the AI Estimator
    has valued the good, widened to the estimator's min/max — a party cannot
    go beyond the estimator's maximum (nor the reference, whichever is higher)
    by more than the slab's tolerance;
  * the tolerance (allowed fluctuation, in %) depends on the PRICE SLAB the
    reference price falls in — small amounts fluctuate more, large ones less.

Slabs are configurable with PRICE_GUARDRAIL_SLABS (JSON list of
[upper_bound_exclusive, tolerance_fraction] pairs, ascending, the last entry
covering everything above the previous bound), e.g.
    [[1000,0.5],[10000,0.35],[100000,0.25],[1000000,0.15],[null,0.10]]
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Tuple

from .config import settings

logger = logging.getLogger(__name__)

# (upper bound exclusive in the good's currency, tolerance fraction)
DEFAULT_SLABS: List[Tuple[float | None, float]] = [
    (1_000.0, 0.50),
    (10_000.0, 0.35),
    (100_000.0, 0.25),
    (1_000_000.0, 0.15),
    (None, 0.10),
]


def slabs() -> List[Tuple[float | None, float]]:
    raw = (getattr(settings, "price_guardrail_slabs", "") or "").strip()
    if not raw:
        return DEFAULT_SLABS
    try:
        parsed = json.loads(raw)
        out: List[Tuple[float | None, float]] = []
        for bound, tol in parsed:
            out.append((None if bound is None else float(bound), float(tol)))
        if out and all(0 <= t <= 5 for _, t in out):
            return out
    except Exception as exc:  # pragma: no cover - config error
        logger.warning("PRICE_GUARDRAIL_SLABS invalid (%s); using defaults", exc)
    return DEFAULT_SLABS


def slab_for(reference: float) -> Tuple[int, float | None, float]:
    """(slab index, upper bound, tolerance) for a reference price."""
    ref = max(0.0, float(reference or 0.0))
    for i, (bound, tol) in enumerate(slabs()):
        if bound is None or ref < bound:
            return i, bound, tol
    i = len(slabs()) - 1
    return i, slabs()[i][0], slabs()[i][1]


def compute_band(
    reference: float,
    ai_min: float | None = None,
    ai_max: float | None = None,
) -> Dict[str, Any]:
    """Allowed [lower, upper] for another party's valuation of the good."""
    ref = max(0.0, float(reference or 0.0))
    idx, bound, tol = slab_for(ref)
    hi_anchor = max(ref, float(ai_max)) if ai_max is not None else ref
    lo_anchor = min(ref, float(ai_min)) if ai_min is not None else ref
    upper = round(hi_anchor * (1.0 + tol), 2)
    lower = round(max(0.0, lo_anchor * (1.0 - tol)), 2)
    return {
        "reference": round(ref, 2),
        "ai_min": None if ai_min is None else round(float(ai_min), 2),
        "ai_max": None if ai_max is None else round(float(ai_max), 2),
        "slab_index": idx,
        "slab_upper_bound": bound,
        "tolerance_pct": round(tol * 100, 1),
        "lower": lower,
        "upper": upper,
    }


def within(band: Dict[str, Any], value: float) -> bool:
    return float(band["lower"]) - 1e-9 <= float(value) <= float(band["upper"]) + 1e-9
