from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import MediationSlot, DisputeAgent, Dispute, AuditEvent, User
from ..schemas import MediationSlotCreateIn, MediationSlotOut
from .deps import get_current_user, can_access_dispute, get_participant

router = APIRouter(prefix="/api/disputes/{dispute_id}/mediation", tags=["mediation"])

def parse_dt(value: str) -> datetime:
    # Accept ISO strings, with or without Z
    v = value.strip()
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(v)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format")
    if dt.tzinfo is None:
        # assume UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

@router.get("/slots", response_model=list[MediationSlotOut])
def list_slots(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    slots = session.exec(select(MediationSlot).where(MediationSlot.dispute_id == dispute_id).order_by(MediationSlot.when.asc())).all()
    out = []
    for s in slots:
        out.append(MediationSlotOut(
            id=s.id,
            when=s.when.isoformat().replace("+00:00", "Z"),
            agreed_agent_ids=s.agreed_agent_ids or [],
            confirmed=bool(s.confirmed),
        ))
    return out

@router.post("/slots", response_model=MediationSlotOut)
def create_slot(dispute_id: int, payload: MediationSlotCreateIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    dt = parse_dt(payload.when)
    slot = MediationSlot(dispute_id=dispute_id, when=dt, agreed_agent_ids=[participant.id], confirmed=False)
    session.add(slot)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="MediationSlotProposed", payload={"when": dt.isoformat()}))
    session.commit()
    session.refresh(slot)
    return MediationSlotOut(id=slot.id, when=slot.when.isoformat().replace("+00:00", "Z"), agreed_agent_ids=slot.agreed_agent_ids, confirmed=slot.confirmed)

@router.post("/slots/{slot_id}/agree", response_model=MediationSlotOut)
def agree_slot(dispute_id: int, slot_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    slot = session.get(MediationSlot, slot_id)
    if not slot or slot.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Slot not found")
    agreed = set(slot.agreed_agent_ids or [])
    agreed.add(participant.id)
    slot.agreed_agent_ids = list(agreed)
    session.add(slot)

    # confirm if all non-mediator joined agents agreed
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id, DisputeAgent.invite_status == "joined")).all()
    non_mediators = [a for a in agents if (a.role_in_dispute or "agent") != "mediator"]
    if non_mediators and all(a.id in agreed for a in non_mediators):
        slot.confirmed = True
        dispute = session.get(Dispute, dispute_id)
        if dispute:
            dispute.status = "mediation"
            session.add(dispute)
        session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="MediationSlotConfirmed", payload={"slot_id": slot_id}))
    session.commit()
    session.refresh(slot)
    return MediationSlotOut(id=slot.id, when=slot.when.isoformat().replace("+00:00", "Z"), agreed_agent_ids=slot.agreed_agent_ids or [], confirmed=bool(slot.confirmed))
