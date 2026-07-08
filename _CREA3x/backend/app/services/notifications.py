"""Notification helpers.

A Notification is a small record addressed to a specific user about something a
counterpart did in a dispute (accepted an invitation, submitted preferences,
agreed to a meeting time, abandoned the dispute, a proposal was generated, etc.).

The bell in the top bar reads these; the archive reads dispute status/PDFs.

Design notes:
- We notify every OTHER participant of the dispute who has a linked user account
  (user_id is set) — never the actor themselves.
- Emitting is best-effort and must never break the action that triggered it, so
  callers should already be inside a session/commit; we add rows and let the
  caller commit (or commit here when asked).
"""
from __future__ import annotations

from typing import Any, Optional

from sqlmodel import Session, select

from ..models import Notification, DisputeAgent, Dispute, User


def _recipient_user_ids(session: Session, dispute_id: int, exclude_user_id: Optional[int]) -> list[int]:
    """User ids of all participants of the dispute except the actor.

    Includes the dispute owner (created_by_id) and every agent that has a linked
    user account. Mediators are included (they care about activity too).
    """
    ids: set[int] = set()

    dispute = session.get(Dispute, dispute_id)
    if dispute is not None and getattr(dispute, "created_by_id", None):
        ids.add(int(dispute.created_by_id))

    agents = session.exec(
        select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)
    ).all()
    for a in agents:
        if a.user_id:
            ids.add(int(a.user_id))
        else:
            # Try to resolve by email to a registered user, so invitees who have
            # since registered still get notified.
            u = session.exec(select(User).where(User.email == a.email)).first()
            if u and u.id:
                ids.add(int(u.id))

    if exclude_user_id is not None:
        ids.discard(int(exclude_user_id))
    return sorted(ids)


def notify_dispute(
    session: Session,
    *,
    dispute_id: int,
    type: str,
    payload: dict[str, Any] | None = None,
    actor_user_id: Optional[int] = None,
    commit: bool = True,
) -> int:
    """Create a Notification for every other participant. Returns count created."""
    payload = dict(payload or {})
    recipients = _recipient_user_ids(session, dispute_id, actor_user_id)
    for uid in recipients:
        session.add(Notification(
            user_id=uid,
            dispute_id=dispute_id,
            type=type,
            payload=payload,
            read=False,
        ))
    if commit:
        session.commit()
    return len(recipients)
