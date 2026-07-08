from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy import delete
from ..db import get_session
from .deps import get_current_user
from ..schemas import UserOut, ProfileUpdateIn
from ..core.keycloak_admin import KeycloakAdmin, KeycloakAuthError
from ..core.geo import COUNTRY_CHOICES, timezone_for_country, language_for_country, is_valid_country
from ..models import User, Dispute, DisputeAgent, Good, Preference, AllocationProposal, Notification, AuditEvent, Strategy, MediationSlot, ReconciliationResponse, Acceptance

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id, email=user.email, username=user.username, role=user.role,
        email_verified=getattr(user, "email_verified", False),
        country=getattr(user, "country", None),
        timezone=getattr(user, "timezone", None),
        locale=getattr(user, "locale", None),
        notify_email_invitations=getattr(user, "notify_email_invitations", True),
        notify_email_meetings=getattr(user, "notify_email_meetings", True),
        notify_email_milestones=getattr(user, "notify_email_milestones", True),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.get("/countries")
def list_countries():
    """Public list of selectable countries for registration/onboarding."""
    return COUNTRY_CHOICES


@router.patch("/me/profile", response_model=UserOut)
def update_profile(payload: ProfileUpdateIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Set the user's provenance. Country auto-sets timezone and (default)
    language; an explicit locale overrides the country's default language; an
    explicit timezone overrides the country's default timezone."""
    changed = False
    if payload.country is not None:
        c = payload.country.upper()
        if not is_valid_country(c):
            raise HTTPException(status_code=400, detail="Unknown country code.")
        user.country = c
        # Country drives timezone and default language (language overridable below).
        user.timezone = timezone_for_country(c)
        user.locale = language_for_country(c)
        changed = True
    if payload.timezone is not None:
        user.timezone = payload.timezone
        changed = True
    if payload.locale is not None:
        user.locale = payload.locale
        changed = True
    for attr in ("notify_email_invitations", "notify_email_meetings", "notify_email_milestones"):
        val = getattr(payload, attr, None)
        if val is not None:
            setattr(user, attr, bool(val))
            changed = True
    if changed:
        session.add(user)
        session.commit()
        session.refresh(user)
    return _user_out(user)



@router.get('/mediators', response_model=list[UserOut])
def list_mediators(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    mediators = session.exec(select(User).where(User.role=='mediator')).all()
    return [_user_out(m) for m in mediators]


class EmailChangeIn(BaseModel):
    email: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str

def _delete_user_data(session: Session, user: User):
    # 1) Delete disputes created by the user (and everything inside them).
    dispute_ids = [d.id for d in session.exec(select(Dispute).where(Dispute.created_by_id == user.id)).all() if d.id]
    if dispute_ids:
        session.exec(delete(Preference).where(Preference.dispute_id.in_(dispute_ids)))
        session.exec(delete(Strategy).where(Strategy.dispute_id.in_(dispute_ids)))
        session.exec(delete(ReconciliationResponse).where(ReconciliationResponse.dispute_id.in_(dispute_ids)))
        # Acceptance rows are keyed by proposal_id; delete via this dispute's proposals.
        _prop_ids = [p.id for p in session.exec(select(AllocationProposal).where(AllocationProposal.dispute_id.in_(dispute_ids))).all() if p.id]
        if _prop_ids:
            session.exec(delete(Acceptance).where(Acceptance.proposal_id.in_(_prop_ids)))
        session.exec(delete(AllocationProposal).where(AllocationProposal.dispute_id.in_(dispute_ids)))
        session.exec(delete(MediationSlot).where(MediationSlot.dispute_id.in_(dispute_ids)))
        session.exec(delete(Notification).where(Notification.dispute_id.in_(dispute_ids)))
        session.exec(delete(AuditEvent).where(AuditEvent.dispute_id.in_(dispute_ids)))
        session.exec(delete(Good).where(Good.dispute_id.in_(dispute_ids)))
        session.exec(delete(DisputeAgent).where(DisputeAgent.dispute_id.in_(dispute_ids)))
        session.exec(delete(Dispute).where(Dispute.id.in_(dispute_ids)))

    # 2) Remove the user's participation in OTHER disputes.
    #    Preference and Strategy are keyed by agent_id (NOT user_id), so we must
    #    first resolve the user's DisputeAgent rows, then delete by those ids.
    my_agent_ids = [
        a.id
        for a in session.exec(select(DisputeAgent).where(DisputeAgent.user_id == user.id)).all()
        if a.id is not None
    ]
    if my_agent_ids:
        session.exec(delete(Preference).where(Preference.agent_id.in_(my_agent_ids)))
        session.exec(delete(Strategy).where(Strategy.agent_id.in_(my_agent_ids)))
        session.exec(delete(ReconciliationResponse).where(ReconciliationResponse.agent_id.in_(my_agent_ids)))
        session.exec(delete(Acceptance).where(Acceptance.agent_id.in_(my_agent_ids)))

    session.exec(delete(Notification).where(Notification.user_id == user.id))
    session.exec(delete(DisputeAgent).where(DisputeAgent.user_id == user.id))

    session.commit()

@router.patch("/me", response_model=UserOut)
def update_me(payload: EmailChangeIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=400, detail="Email already in use")
    # Update in Keycloak as source of truth
    if user.keycloak_sub:
        try:
            KeycloakAdmin().update_user_email(user.keycloak_sub, str(payload.email))
        except KeycloakAuthError:
            raise HTTPException(status_code=502, detail="Keycloak is unreachable")
    user.email = str(payload.email)
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut(id=user.id, email=user.email, username=user.username, role=user.role, email_verified=getattr(user, 'email_verified', False))

@router.delete("/me/data")
def delete_my_data(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _delete_user_data(session, user)
    return {"ok": True}

@router.delete("/me")
def delete_my_account(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _delete_user_data(session, user)
    # Best-effort delete in Keycloak
    if user.keycloak_sub:
        try:
            KeycloakAdmin().delete_user(user.keycloak_sub)
        except KeycloakAuthError:
            # Do not block local cleanup
            pass
    session.delete(user)
    session.commit()
    return {"ok": True}


@router.post("/me/password")
def change_password(payload: PasswordChangeIn, user: User = Depends(get_current_user)):
    if not user.keycloak_sub:
        raise HTTPException(status_code=400, detail="Keycloak identity not linked")
    try:
        kc = KeycloakAdmin()
        # Validate current password by trying to obtain a token
        kc.password_grant(user.email, payload.current_password)
        kc.set_user_password(user.keycloak_sub, payload.new_password)
        return {"ok": True}
    except KeycloakAuthError:
        raise HTTPException(status_code=403, detail="Invalid current password")
