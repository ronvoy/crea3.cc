from __future__ import annotations

"""Live foreign-exchange rates with a short-lived in-memory cache.

Asset values are entered in whatever currency a party thinks in, so the goods
section needs to restate them in one currency. Rates are pulled from the
European Central Bank's official daily reference feed (no API key, no account),
with frankfurter.app as a secondary source, and kept in a temporary cache for
`TTL_SECONDS` so a page full of conversions costs one fetch per day-ish.

Everything is expressed against EUR, the ECB base.
"""

import logging
import re
import threading
import time
from datetime import date

import httpx

logger = logging.getLogger(__name__)

ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=EUR"
TTL_SECONDS = 6 * 60 * 60          # refresh a few times a day; rates move daily
_UA = "Mozilla/5.0 (compatible; CREA3-FX/1.0; +https://crea3.cc)"

_CACHE: dict = {"rates": None, "date": None, "fetched_at": 0.0, "source": ""}
_LOCK = threading.Lock()

# Used when both sources are unreachable, so conversion still degrades sanely.
_STATIC_FALLBACK = {
    "EUR": 1.0, "USD": 1.09, "GBP": 0.85, "CHF": 0.94, "SEK": 11.3, "DKK": 7.46,
    "NOK": 11.6, "PLN": 4.30, "CZK": 25.1, "RON": 4.97, "HUF": 395.0, "BGN": 1.96,
}

_RATE_RE = re.compile(r"currency=['\"]([A-Z]{3})['\"]\s+rate=['\"]([0-9.]+)['\"]")
_DATE_RE = re.compile(r"time=['\"](\d{4}-\d{2}-\d{2})['\"]")


def _fetch_ecb() -> tuple[dict, str] | None:
    with httpx.Client(timeout=8.0, headers={"User-Agent": _UA}, follow_redirects=True) as c:
        r = c.get(ECB_URL)
    if r.status_code != 200 or "currency=" not in r.text:
        return None
    rates = {cur: float(val) for cur, val in _RATE_RE.findall(r.text)}
    if not rates:
        return None
    rates["EUR"] = 1.0
    d = _DATE_RE.search(r.text)
    return rates, (d.group(1) if d else date.today().isoformat())


def _fetch_frankfurter() -> tuple[dict, str] | None:
    with httpx.Client(timeout=8.0, headers={"User-Agent": _UA}) as c:
        r = c.get(FRANKFURTER_URL)
    if r.status_code != 200:
        return None
    data = r.json()
    rates = {k: float(v) for k, v in (data.get("rates") or {}).items()}
    if not rates:
        return None
    rates["EUR"] = 1.0
    return rates, str(data.get("date") or date.today().isoformat())


def get_rates(force: bool = False) -> dict:
    """{'rates': {CUR: per-EUR}, 'date': 'YYYY-MM-DD', 'source': str, 'cached': bool}."""
    now = time.time()
    with _LOCK:
        fresh = _CACHE["rates"] and (now - _CACHE["fetched_at"]) < TTL_SECONDS
        if fresh and not force:
            return {"rates": _CACHE["rates"], "date": _CACHE["date"],
                    "source": _CACHE["source"], "cached": True}

    rates = source = day = None
    for name, fn in (("ecb", _fetch_ecb), ("frankfurter", _fetch_frankfurter)):
        try:
            got = fn()
        except Exception as exc:
            logger.info("fx: %s unavailable (%s)", name, exc)
            got = None
        if got:
            rates, day = got
            source = name
            break

    if not rates:
        with _LOCK:
            if _CACHE["rates"]:          # serve a stale cache rather than nothing
                return {"rates": _CACHE["rates"], "date": _CACHE["date"],
                        "source": _CACHE["source"] + "-stale", "cached": True}
        return {"rates": dict(_STATIC_FALLBACK), "date": None, "source": "fallback", "cached": False}

    with _LOCK:
        _CACHE.update({"rates": rates, "date": day, "fetched_at": now, "source": source})
    return {"rates": rates, "date": day, "source": source, "cached": False}


def convert(amount: float, src: str, dst: str) -> float | None:
    """Convert between two ISO codes using the cached rates (None if unknown)."""
    src, dst = (src or "EUR").upper()[:3], (dst or "EUR").upper()[:3]
    if src == dst:
        return float(amount)
    rates = get_rates()["rates"] or {}
    if src not in rates or dst not in rates:
        return None
    return float(amount) / rates[src] * rates[dst]
