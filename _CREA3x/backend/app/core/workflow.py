"""Canonical workflow vocabulary and state-machine rules.

Previously the dispute status and the participant invite status were free-form
strings, written in ~8 different places with subtly different spellings
("joined" vs "accepted", "invited" vs "pending"). Status could also be set to
any arbitrary value via PATCH /status, allowing illegal jumps (e.g. draft ->
finalized).

This module centralizes:
  * the allowed dispute statuses (DisputeStatus)
  * the allowed participant invite statuses (InviteStatus)
  * the allowed dispute role names (DisputeRole)
  * the legal status transitions (ALLOWED_TRANSITIONS)
  * a single definition of "is this dispute locked for structural edits?"

Everything else imports from here so the vocabulary cannot drift again.
"""

from __future__ import annotations

from enum import Enum


class DisputeStatus(str, Enum):
    DRAFT = "draft"
    COLLECTING = "collecting"
    VALIDATING = "validating"
    RECONCILING = "reconciling"
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    MEDIATION = "mediation"
    FINALIZED = "finalized"
    ABANDONED = "abandoned"


class InviteStatus(str, Enum):
    INVITED = "invited"
    JOINED = "joined"
    DECLINED = "declined"


class DisputeRole(str, Enum):
    CLAIMANT = "claimant"
    RESPONDENT = "respondent"
    AGENT = "agent"
    MEDIATOR = "mediator"
    ADVISOR = "advisor"


# Legal forward transitions for the dispute lifecycle.
# A transition not listed here is rejected by `assert_transition`.
ALLOWED_TRANSITIONS: dict[DisputeStatus, set[DisputeStatus]] = {
    DisputeStatus.DRAFT: {DisputeStatus.COLLECTING, DisputeStatus.VALIDATING, DisputeStatus.ABANDONED},
    DisputeStatus.COLLECTING: {DisputeStatus.VALIDATING, DisputeStatus.RECONCILING, DisputeStatus.PROPOSED, DisputeStatus.ABANDONED},
    DisputeStatus.VALIDATING: {DisputeStatus.COLLECTING, DisputeStatus.RECONCILING, DisputeStatus.PROPOSED, DisputeStatus.ABANDONED},
    DisputeStatus.RECONCILING: {DisputeStatus.PROPOSED, DisputeStatus.COLLECTING, DisputeStatus.ABANDONED},
    DisputeStatus.PROPOSED: {DisputeStatus.ACCEPTED, DisputeStatus.MEDIATION, DisputeStatus.COLLECTING, DisputeStatus.ABANDONED},
    DisputeStatus.ACCEPTED: {DisputeStatus.FINALIZED, DisputeStatus.MEDIATION, DisputeStatus.ABANDONED},
    DisputeStatus.MEDIATION: {DisputeStatus.PROPOSED, DisputeStatus.ACCEPTED, DisputeStatus.FINALIZED, DisputeStatus.ABANDONED},
    DisputeStatus.FINALIZED: set(),  # terminal
    DisputeStatus.ABANDONED: set(),  # terminal
}


# Statuses during which the *structure* of a dispute (its goods, its agents,
# preferences and strategies) may still be edited. Once a dispute leaves these,
# its inputs are frozen so an already-generated proposal cannot be silently
# invalidated. This is the single source of truth for the lock referenced by
# D3.2 ("Edits are locked once the dispute enters the evaluation phase").
EDITABLE_STATUSES: set[DisputeStatus] = {DisputeStatus.DRAFT, DisputeStatus.COLLECTING}


def is_valid_status(value: str) -> bool:
    try:
        DisputeStatus(value)
        return True
    except ValueError:
        return False


def is_editable(status: str | DisputeStatus) -> bool:
    """True if structural edits (goods/agents/preferences/strategy) are allowed."""
    try:
        s = DisputeStatus(status)
    except ValueError:
        return False
    return s in EDITABLE_STATUSES


def can_transition(current: str | DisputeStatus, target: str | DisputeStatus) -> bool:
    try:
        c = DisputeStatus(current)
        t = DisputeStatus(target)
    except ValueError:
        return False
    if c == t:
        return True  # idempotent no-op is allowed
    return t in ALLOWED_TRANSITIONS.get(c, set())
