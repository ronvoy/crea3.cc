from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import AuditEvent, Dispute, DisputeAgent, User
from ..schemas import DisputeCreateIn, DisputeOut
from .deps import can_access_dispute, get_current_user

router = APIRouter(prefix="/api/disputes", tags=["disputes"])

@router.post("", response_model=DisputeOut)
def create_dispute(payload: DisputeCreateIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = Dispute(title=payload.title, method=payload.method, created_by_id=user.id, status="draft")
    session.add(d)
    session.commit()
    session.refresh(d)
    session.add(AuditEvent(dispute_id=d.id, actor_user_id=user.id, event_type="DisputeCreated", payload={"method": d.method, "title": d.title}))
    session.commit()
    return DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status)

@router.get("", response_model=list[DisputeOut])
def list_disputes(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    if user.role == "admin":
        q = select(Dispute)
    elif user.role == "user":
        q = select(Dispute).where(Dispute.created_by_id == user.id)
    else:
        # agent: disputes where their email is assigned
        q = select(Dispute).join(DisputeAgent, DisputeAgent.dispute_id == Dispute.id).where(DisputeAgent.email == user.email)
    disputes = session.exec(q.order_by(Dispute.id.desc())).all()
    return [DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status) for d in disputes]

@router.get("/{dispute_id}", response_model=DisputeOut)
def get_dispute(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = can_access_dispute(dispute_id, user, session)
    return DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status)

@router.patch("/{dispute_id}/status", response_model=DisputeOut)
def set_status(dispute_id: int, status_value: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = can_access_dispute(dispute_id, user, session)
    # Only creator/admin can set status
    if user.role != "admin" and d.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can change status")
    d.status = status_value
    session.add(d)
    session.add(AuditEvent(dispute_id=d.id, actor_user_id=user.id, event_type="DisputeStatusChanged", payload={"status": d.status}))
    session.commit()
    session.refresh(d)
    return DisputeOut(id=d.id, title=d.title, method=d.method, status=d.status)

@router.delete("/{dispute_id}")
def delete_dispute(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = can_access_dispute(dispute_id, user, session)
    if user.role != "admin" and d.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete")
    session.delete(d)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="DisputeDeleted", payload={}))
    session.commit()
    return {"ok": True}
