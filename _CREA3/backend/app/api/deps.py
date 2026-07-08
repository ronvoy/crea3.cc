from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from ..core.config import settings
from ..db import get_session
from ..core.auth_tokens import decode_token
from ..models import User, Dispute, DisputeAgent

bearer_scheme = HTTPBearer(auto_error=False)


def _unique_username(session: Session, base: str, *, exclude_user_id: int | None = None) -> str:
    candidate = base.strip() or "user"
    if len(candidate) > 120:
        candidate = candidate[:120]

    def exists(name: str) -> bool:
        q = select(User).where(User.username == name)
        if exclude_user_id is not None:
            q = q.where(User.id != exclude_user_id)
        return session.exec(q).first() is not None

    if not exists(candidate):
        return candidate

    # add suffix
    for i in range(1, 10_000):
        suffix = f"{i}"
        trimmed = candidate
        if len(trimmed) + len(suffix) + 1 > 120:
            trimmed = trimmed[: (120 - (len(suffix) + 1))]
        alt = f"{trimmed}-{suffix}"
        if not exists(alt):
            return alt

    return f"{candidate}-x"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
        )

    try:
        payload = decode_token(credentials.credentials)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    # Our access tokens carry the local user id in `sub`.
    user: User | None = None
    sub = payload.get("sub")
    if sub is not None:
        try:
            user = session.get(User, int(sub))
        except (TypeError, ValueError):
            user = None
    if not user and payload.get("email"):
        user = session.exec(select(User).where(User.email == payload["email"])).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    if settings.keycloak_require_verified_email and not getattr(user, "email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address is not verified.",
        )

    # AUTO-LINK invitations: attach DisputeAgent rows by email
    # so invited user can see/respond properly
    agents_to_link = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.email == user.email,
            DisputeAgent.user_id.is_(None),
        )
    ).all()
    if agents_to_link:
        for a in agents_to_link:
            a.user_id = user.id
            session.add(a)
        session.commit()

    return user


# ---------------------------------------------------------------------------
# Dispute access helpers
# ---------------------------------------------------------------------------

def get_participant(dispute_id: int, user: User, session: Session) -> DisputeAgent | None:
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
