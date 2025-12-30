from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from ..core.config import settings
from ..db import get_session
from ..core.keycloak import verify_access_token
from ..models import User, Dispute, DisputeAgent

bearer_scheme = HTTPBearer(auto_error=False)


def _provision_user(session: Session, email: str, username: str, email_verified: bool) -> User:
    user = User(email=email, username=username, hashed_password="")
    # Keep local flag in sync if the column exists
    if hasattr(user, "email_verified"):
        setattr(user, "email_verified", bool(email_verified))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
        )

    payload = verify_access_token(credentials.credentials)

    if settings.keycloak_require_verified_email and payload.get("email_verified") is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address is not verified. Please verify your email in Keycloak.",
        )

    email = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token does not include an email claim.",
        )

    username = payload.get("preferred_username") or email.split("@", 1)[0]
    email_verified = bool(payload.get("email_verified", False))

    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        user = _provision_user(session, email=email, username=username, email_verified=email_verified)

    return user
# ---------------------------------------------------------------------------
# Dispute access helpers
# ---------------------------------------------------------------------------

def get_participant(dispute_id: int, user: User, session: Session) -> DisputeAgent | None:
    """Return the DisputeAgent row for the current user (if they are an agent/participant)."""
    return session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.user_id == user.id,
        )
    ).first()


def require_participant_role(
    participant: DisputeAgent | None,
    *,
    deny_roles: tuple[str, ...] = (),
) -> DisputeAgent:
    """Ensure the user is a participant and (optionally) not in a denied role set."""
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this dispute.",
        )
    if participant.role_in_dispute and participant.role_in_dispute in deny_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role is not allowed to perform this action.",
        )
    return participant


def can_access_dispute(dispute_id: int, user: User, session: Session) -> Dispute:
    """Load a dispute and check access for the current user.

    Access is granted if:
    - the user is an admin; OR
    - the user created the dispute; OR
    - the user is listed as an agent/participant (DisputeAgent.user_id).
    """
    dispute = session.get(Dispute, dispute_id)
    if not dispute:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispute not found")

    if getattr(user, "role", None) == "admin" or dispute.created_by_id == user.id:
        return dispute

    participant = get_participant(dispute_id, user, session)
    if participant is not None:
        return dispute

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this dispute.",
    )
