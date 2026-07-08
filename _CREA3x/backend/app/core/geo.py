"""Country -> timezone + UI language mapping.

Single source of truth for turning a user's provenance (country) into:
  * an IANA timezone (used to display meeting times in the user's local time), and
  * a default UI language code (matching the app's i18n languages).

The six CREA3 consortium countries are first-class; a handful of common others
are included for convenience. Unknown countries fall back to UTC / English.
"""
from __future__ import annotations

from typing import Optional

# country code -> (IANA timezone, language code)
# Language codes match the frontend i18n set: en, it, sl, et, be(fr-BE), lt, hr.
COUNTRY_MAP: dict[str, tuple[str, str]] = {
    # --- CREA3 consortium ---
    "IT": ("Europe/Rome", "it"),        # Italy
    "BE": ("Europe/Brussels", "be"),    # Belgium (French/Belgian French -> 'be')
    "SI": ("Europe/Ljubljana", "sl"),   # Slovenia
    "LT": ("Europe/Vilnius", "lt"),     # Lithuania
    "HR": ("Europe/Zagreb", "hr"),      # Croatia
    "EE": ("Europe/Tallinn", "et"),     # Estonia
    # --- a few common others (default language English) ---
    "FR": ("Europe/Paris", "be"),       # France -> French strings ('be' locale is fr-BE)
    "DE": ("Europe/Berlin", "en"),
    "ES": ("Europe/Madrid", "en"),
    "PT": ("Europe/Lisbon", "en"),
    "NL": ("Europe/Amsterdam", "en"),
    "AT": ("Europe/Vienna", "en"),
    "IE": ("Europe/Dublin", "en"),
    "GB": ("Europe/London", "en"),
    "PL": ("Europe/Warsaw", "en"),
    "GR": ("Europe/Athens", "en"),
    "US": ("America/New_York", "en"),
}

# Display list for the registration/onboarding dropdown (code + English name).
COUNTRY_CHOICES: list[dict[str, str]] = [
    {"code": "IT", "name": "Italy"},
    {"code": "BE", "name": "Belgium"},
    {"code": "SI", "name": "Slovenia"},
    {"code": "LT", "name": "Lithuania"},
    {"code": "HR", "name": "Croatia"},
    {"code": "EE", "name": "Estonia"},
    {"code": "FR", "name": "France"},
    {"code": "DE", "name": "Germany"},
    {"code": "ES", "name": "Spain"},
    {"code": "PT", "name": "Portugal"},
    {"code": "NL", "name": "Netherlands"},
    {"code": "AT", "name": "Austria"},
    {"code": "IE", "name": "Ireland"},
    {"code": "GB", "name": "United Kingdom"},
    {"code": "PL", "name": "Poland"},
    {"code": "GR", "name": "Greece"},
    {"code": "US", "name": "United States"},
]

DEFAULT_TZ = "UTC"
DEFAULT_LANG = "en"


def timezone_for_country(country: Optional[str]) -> str:
    if not country:
        return DEFAULT_TZ
    return COUNTRY_MAP.get(country.upper(), (DEFAULT_TZ, DEFAULT_LANG))[0]


def language_for_country(country: Optional[str]) -> str:
    if not country:
        return DEFAULT_LANG
    return COUNTRY_MAP.get(country.upper(), (DEFAULT_TZ, DEFAULT_LANG))[1]


def is_valid_country(country: Optional[str]) -> bool:
    return bool(country) and country.upper() in COUNTRY_MAP
