"""Centralized authorization helpers.

Before, role checks were re-implemented ad hoc in agents.py, goods.py,
preferences.py, proposals.py and strategy.py with slightly different rules
(different invite-status spellings, different mediator handling). This module
is the single place those rules live so they stay consistent.

Conventions:
  * `user.role` is the *global* Keycloak role (admin | user | agent | mediator).
  * `participant.role_in_dispute` is the role *within a specific dispute*
    (claimant | respondent | agent | mediator | advisor).
  * A mediator (by either definition) may VIEW but never edit inputs or submit
    preferences/proposals.
"""

from __future__ import annotations

from fastapi import HTTPException, status as http_status
from sqlmodel import Session, select

from ..models import Dispute, DisputeAgent, User
from .workflow import DisputeRole, InviteStatus, is_editable


def is_admin(user: User) -> bool:
    return getattr(user, "role", None) == "admin"


def is_owner(dispute: Dispute, user: User) -> bool:
    return dispute.created_by_id == user.id


def get_participant(session: Session, dispute_id: int, user: User) -> DisputeAgent | None:
    """Resolve the caller's participant row, by linked user_id OR by email."""
    return session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            ((DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email)),
        )
    ).first()


def participant_is_mediator(user: User, participant: DisputeAgent | None) -> bool:
    if getattr(user, "role", None) == "mediator":
        return True
    if participant and (participant.role_in_dispute or "").lower() == DisputeRole.MEDIATOR.value:
        return True
    return False


def participant_is_joined(participant: DisputeAgent | None) -> bool:
    return bool(participant and participant.invite_status == InviteStatus.JOINED.value)


# --------------------------------------------------------------------------
# Guards (raise HTTPException on failure)
# --------------------------------------------------------------------------

def require_dispute(session: Session, dispute_id: int) -> Dispute:
    dispute = session.get(Dispute, dispute_id)
    if not dispute:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Dispute not found")
    return dispute


def require_access(session: Session, dispute_id: int, user: User) -> Dispute:
    """Caller must be admin, owner, or a participant of the dispute."""
    dispute = require_dispute(session, dispute_id)
    if is_admin(user) or is_owner(dispute, user):
        return dispute
    if get_participant(session, dispute_id, user) is not None:
        return dispute
    raise HTTPException(
        status_code=http_status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this dispute.",
    )


def require_can_manage_structure(session: Session, dispute_id: int, user: User) -> Dispute:
    """Add/edit/remove goods or agents.

    Allowed for: admin, owner, or a JOINED non-mediator participant.
    Rejected once the dispute leaves an editable status (lock).
    """
    dispute = require_access(session, dispute_id, user)

    if not is_editable(dispute.status):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Dispute inputs are locked in the current stage and can no longer be edited.",
        )

    if is_admin(user) or is_owner(dispute, user):
        return dispute

    participant = get_participant(session, dispute_id, user)
    if participant_is_joined(participant) and not participant_is_mediator(user, participant):
        return dispute

    raise HTTPException(
        status_code=http_status.HTTP_403_FORBIDDEN,
        detail="Only the owner/admin or a joined participant can edit dispute inputs.",
    )


def require_can_submit_inputs(session: Session, dispute_id: int, user: User) -> tuple[Dispute, DisputeAgent]:
    """Submit preferences / strategy. Caller must be a joined, non-mediator participant
    and the dispute must still be editable."""
    dispute = require_access(session, dispute_id, user)

    if not is_editable(dispute.status):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Dispute is locked for edits in the current stage.",
        )

    participant = get_participant(session, dispute_id, user)
    if participant is None:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You are not a participant in this dispute.")
    if participant_is_mediator(user, participant):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Mediators are not allowed to submit inputs.")
    if not participant_is_joined(participant):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You must accept the invite first.")
    return dispute, participant


def require_not_mediator(user: User, participant: DisputeAgent | None) -> None:
    if participant_is_mediator(user, participant):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Mediators can only view, not act.")
