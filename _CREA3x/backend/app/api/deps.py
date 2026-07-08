from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from ..core.config import settings
from ..db import get_session
from ..core.keycloak import verify_access_token
from ..models import User, Dispute, DisputeAgent

bearer_scheme = HTTPBearer(auto_error=False)


def _extract_roles(payload: dict) -> set[str]:
    roles: set[str] = set()
    ra = payload.get("realm_access") or {}
    for r in (ra.get("roles") or []):
        roles.add(str(r))

    # sometimes roles also come from resource_access[client].roles
    resource_access = payload.get("resource_access") or {}
    for _client, data in resource_access.items():
        for r in (data.get("roles") or []):
            roles.add(str(r))
    return roles


def _pick_local_role(roles: set[str]) -> str:
    # priority
    if "admin" in roles:
        return "admin"
    if "mediator" in roles:
        return "mediator"
    if "agent" in roles:
        return "agent"
    return "user"


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


def _provision_user(session: Session, *, email: str, username: str, email_verified: bool, sub: str | None, role: str) -> User:
    uname = _unique_username(session, username)
    user = User(email=email, username=uname, hashed_password="")
    if hasattr(user, "email_verified"):
        setattr(user, "email_verified", bool(email_verified))
    if hasattr(user, "keycloak_sub"):
        setattr(user, "keycloak_sub", sub)
    if hasattr(user, "role"):
        setattr(user, "role", role)

    session.add(user)
    try:
        session.commit()
        session.refresh(user)
    except IntegrityError:
        # Another concurrent first-login created the same user; reuse that row.
        session.rollback()
        existing = None
        if sub:
            existing = session.exec(select(User).where(User.keycloak_sub == sub)).first()
        if not existing:
            existing = session.exec(select(User).where(User.email == email)).first()
        if existing is None:
            raise
        user = existing
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
        )

    payload = verify_access_token(credentials.credentials)
    # Cache claims so the access-log middleware can read the email without
    # verifying the token a second time.
    try:
        request.state.token_claims = payload
    except Exception:
        pass

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

    sub = payload.get("sub")
    preferred = payload.get("preferred_username") or email.split("@", 1)[0]
    email_verified = bool(payload.get("email_verified", False))

    roles = _extract_roles(payload)
    local_role = _pick_local_role(roles)

    # find by keycloak_sub first (if present), else by email
    user = None
    if sub:
        user = session.exec(select(User).where(User.keycloak_sub == sub)).first()
    if not user:
        user = session.exec(select(User).where(User.email == email)).first()

    if not user:
        user = _provision_user(
            session,
            email=email,
            username=preferred,
            email_verified=email_verified,
            sub=sub,
            role=local_role,
        )
    else:
        changed = False

        # update email_verified
        if hasattr(user, "email_verified") and getattr(user, "email_verified", None) != email_verified:
            setattr(user, "email_verified", email_verified)
            changed = True

        # update sub
        if sub and hasattr(user, "keycloak_sub") and getattr(user, "keycloak_sub", None) != sub:
            setattr(user, "keycloak_sub", sub)
            changed = True

        # update role (from token)
        if hasattr(user, "role") and getattr(user, "role", None) != local_role:
            setattr(user, "role", local_role)
            changed = True

        # update username ONLY if it won't conflict
        desired = preferred
        if desired and hasattr(user, "username"):
            safe = _unique_username(session, desired, exclude_user_id=user.id)
            if safe != user.username:
                user.username = safe
                changed = True

        if changed:
            try:
                session.add(user)
                session.commit()
                session.refresh(user)
            except IntegrityError:
                session.rollback()
                # don't block login if username collision still happens for old DB state

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
    # Match by linked user_id OR by email. A participant's user_id is only set
    # when they accept an invitation, so a party who was added by email but never
    # went through that flow (e.g. the dispute owner, who is often also a party)
    # would otherwise not be recognised here and would be wrongly blocked from
    # submitting preferences, marking ready, reconciling, strategy and mediation.
    return session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            ((DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email)),
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


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Allow only callers holding the Keycloak 'admin' realm role.

    Replaces the previous self-signed HS256 'mock admin' token, which could be
    forged because it was signed with a default secret.
    """
    if getattr(user, "role", None) != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges are required.",
        )
    return user
