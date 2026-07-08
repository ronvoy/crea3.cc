from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Good, DisputeAgent, AuditEvent, User
from ..schemas import GoodAddIn
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/goods", tags=["goods"])

def can_edit(dispute_id: int, user: User, session: Session, owner_id: int) -> bool:
    if user.role == "admin" or owner_id == user.id:
        return True
    participant = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            (DisputeAgent.user_id == user.id) | (DisputeAgent.email == user.email),
        )
    ).first()
    return bool(participant and participant.invite_status == "joined" and (participant.role_in_dispute or "agent") != "mediator")

@router.get("")
def list_goods(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    return goods

@router.post("")
def add_good(dispute_id: int, payload: GoodAddIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    if not can_edit(dispute_id, user, session, dispute.created_by_id):
        raise HTTPException(status_code=403, detail="Only owner/admin or joined agents can add goods")
    meta = dict(payload.meta or {})
    meta.setdefault('currency', getattr(payload, 'currency', 'EUR'))
    meta['shareable'] = bool(getattr(payload, 'shareable', True))
    meta['invisible'] = bool(getattr(payload, 'invisible', False))
    good = Good(dispute_id=dispute_id, name=payload.name, estimated_value=payload.estimated_value, indivisible=payload.indivisible, meta=meta)
    session.add(good)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodAdded", payload={"name": payload.name}))
    session.commit()
    session.refresh(good)
    return good

@router.patch("/{good_id}")
def update_good(dispute_id: int, good_id: int, payload: GoodAddIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    if not can_edit(dispute_id, user, session, dispute.created_by_id):
        raise HTTPException(status_code=403, detail="Only owner/admin or joined agents can edit goods")
    good = session.get(Good, good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")
    good.name = payload.name
    good.estimated_value = payload.estimated_value
    good.indivisible = payload.indivisible
    good.meta = payload.meta
    session.add(good)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodUpdated", payload={"good_id": good_id}))
    session.commit()
    session.refresh(good)
    return good

@router.delete("/{good_id}")
def delete_good(dispute_id: int, good_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    if not can_edit(dispute_id, user, session, dispute.created_by_id):
        raise HTTPException(status_code=403, detail="Only owner/admin or joined agents can remove goods")
    good = session.get(Good, good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")
    session.delete(good)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodDeleted", payload={"good_id": good_id}))
    session.commit()
    return {"ok": True}
