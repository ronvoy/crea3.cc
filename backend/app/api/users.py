from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy import delete
from ..db import get_session
from .deps import get_current_user
from ..schemas import UserOut
from ..core.keycloak_admin import KeycloakAdmin, KeycloakAuthError
from ..models import User, Dispute, DisputeAgent, Good, Preference, AllocationProposal, Notification, AuditEvent, Strategy, MediationSlot

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut(id=user.id, email=user.email, username=user.username, role=user.role, email_verified=getattr(user, 'email_verified', False))


@router.get('/mediators', response_model=list[UserOut])
def list_mediators(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    mediators = session.exec(select(User).where(User.role=='mediator')).all()
    return [UserOut(id=m.id, email=m.email, username=m.username, role=m.role, email_verified=getattr(m, 'email_verified', False)) for m in mediators]


class EmailChangeIn(BaseModel):
    email: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str

def _delete_user_data(session: Session, user: User):
    # Delete disputes created by user (and everything inside)
    dispute_ids = [d.id for d in session.exec(select(Dispute).where(Dispute.created_by_id == user.id)).all() if d.id]
    if dispute_ids:
        session.exec(delete(Preference).where(Preference.dispute_id.in_(dispute_ids)))
        session.exec(delete(Strategy).where(Strategy.dispute_id.in_(dispute_ids)))
        session.exec(delete(AllocationProposal).where(AllocationProposal.dispute_id.in_(dispute_ids)))
        session.exec(delete(MediationSlot).where(MediationSlot.dispute_id.in_(dispute_ids)))
        session.exec(delete(Notification).where(Notification.dispute_id.in_(dispute_ids)))
        session.exec(delete(AuditEvent).where(AuditEvent.dispute_id.in_(dispute_ids)))
        session.exec(delete(Good).where(Good.dispute_id.in_(dispute_ids)))
        session.exec(delete(DisputeAgent).where(DisputeAgent.dispute_id.in_(dispute_ids)))
        session.exec(delete(Dispute).where(Dispute.id.in_(dispute_ids)))

    # Remove user participation + their preferences/strategy in other disputes
    session.exec(delete(Notification).where(Notification.user_id == user.id))
    session.exec(delete(Preference).where(Preference.user_id == user.id))
    session.exec(delete(Strategy).where(Strategy.user_id == user.id))
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
