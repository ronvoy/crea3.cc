from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import MediationSlot, DisputeAgent, Dispute, AuditEvent, User
from ..schemas import MediationSlotCreateIn, MediationSlotOut, MediationParticipantState
from .deps import get_current_user, can_access_dispute, get_participant

router = APIRouter(prefix="/api/disputes/{dispute_id}/mediation", tags=["mediation"])


def parse_dt(value: str, *, assume_tz: str | None = None) -> datetime:
    """Parse a datetime to UTC.

    - ISO strings carrying an offset (or trailing 'Z') are honored as-is.
    - A NAIVE value (e.g. an HTML datetime-local "2026-06-26T12:47", no offset) is
      interpreted in `assume_tz` (the proposer's provenance timezone) if given,
      otherwise UTC. This keeps the meeting time anchored to the user's own zone:
      "12:47" typed by a Rome user means 12:47 in Rome, stored as 10:47 UTC.
    """
    v = value.strip()
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(v)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format")
    if dt.tzinfo is None:
        tzinfo = timezone.utc
        if assume_tz:
            try:
                from zoneinfo import ZoneInfo
                tzinfo = ZoneInfo(assume_tz)
            except Exception:
                tzinfo = timezone.utc
        dt = dt.replace(tzinfo=tzinfo)
    return dt.astimezone(timezone.utc)


def _joined_participants(session: Session, dispute_id: int) -> list[DisputeAgent]:
    """All joined participants - parties AND mediators - who take part in scheduling."""
    return session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.invite_status == "joined",
        )
    ).all()


def _serialize(session: Session, slot: MediationSlot, participants: list[DisputeAgent], viewer: User | None = None) -> MediationSlotOut:
    agreed = set(slot.agreed_agent_ids or [])

    # Resolve each participant's provenance (timezone/country) for the scheduling UI.
    def _prov(p: DisputeAgent) -> tuple[str | None, str | None]:
        u = None
        try:
            if getattr(p, "user_id", None):
                u = session.get(User, p.user_id)
            if u is None and getattr(p, "email", None):
                u = session.exec(select(User).where(User.email == p.email)).first()
        except Exception:
            u = None
        return (getattr(u, "timezone", None) if u else None, getattr(u, "country", None) if u else None)

    states = []
    for p in participants:
        ptz, pcountry = _prov(p)
        states.append(MediationParticipantState(
            agent_id=p.id,
            name=p.name or f"#{p.id}",
            role=(p.role_in_dispute or "agent"),
            agreed=p.id in agreed,
            timezone=ptz,
            country=pcountry,
        ))
    proposer = next((p for p in participants if p.id == slot.proposed_by_agent_id), None)

    # Format the meeting time in the viewing user's local timezone (provenance).
    when_local = None
    tz_name = (getattr(viewer, "timezone", None) or "UTC") if viewer else "UTC"
    try:
        from zoneinfo import ZoneInfo
        dt = slot.when
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local = dt.astimezone(ZoneInfo(tz_name))
        # e.g. "01 Jul 2026, 12:00 (Europe/Rome)"
        when_local = local.strftime("%d %b %Y, %H:%M")
    except Exception:
        when_local = None
        tz_name = "UTC"

    return MediationSlotOut(
        id=slot.id,
        when=slot.when.isoformat().replace("+00:00", "Z"),
        when_local=when_local,
        tz=tz_name,
        agreed_agent_ids=list(agreed),
        confirmed=bool(slot.confirmed),
        proposed_by_agent_id=slot.proposed_by_agent_id,
        proposed_by_name=(proposer.name if proposer else None),
        participants=states,
        agreed_count=sum(1 for s in states if s.agreed),
        total_count=len(states),
    )


@router.get("/slots", response_model=list[MediationSlotOut])
def list_slots(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    participants = _joined_participants(session, dispute_id)
    slots = session.exec(
        select(MediationSlot).where(MediationSlot.dispute_id == dispute_id).order_by(MediationSlot.when.asc())
    ).all()
    return [_serialize(session, s, participants, viewer=user) for s in slots]


@router.post("/slots", response_model=MediationSlotOut)
def create_slot(dispute_id: int, payload: MediationSlotCreateIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    # Interpret a naive proposed time in the proposer's own provenance timezone.
    dt = parse_dt(payload.when, assume_tz=getattr(user, "timezone", None))
    # The proposer implicitly agrees to their own proposed time.
    slot = MediationSlot(
        dispute_id=dispute_id, when=dt, agreed_agent_ids=[participant.id],
        confirmed=False, proposed_by_agent_id=participant.id,
    )
    session.add(slot)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                           event_type="MediationSlotProposed", payload={"when": dt.isoformat()}))
    session.commit()
    session.refresh(slot)
    return _serialize(session, slot, _joined_participants(session, dispute_id), viewer=user)


def _maybe_confirm(session: Session, slot: MediationSlot, dispute_id: int, user: User) -> None:
    """Confirm the slot once EVERY joined participant (parties + mediators) agrees."""
    participants = _joined_participants(session, dispute_id)
    agreed = set(slot.agreed_agent_ids or [])
    if participants and all(p.id in agreed for p in participants):
        slot.confirmed = True
        dispute = session.get(Dispute, dispute_id)
        if dispute and dispute.status not in ("finalized",):
            dispute.status = "mediation"
            session.add(dispute)
        session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                               event_type="MediationSlotConfirmed", payload={"slot_id": slot.id}))

        # Send a reminder email to every involved participant, with the link to
        # the video conference. Best-effort: never block confirmation.
        try:
            from ..core.email import send_meeting_reminder_email
            conference_url = f"https://meet.jit.si/CREA3-Dispute-{dispute_id}"
            title = dispute.title if dispute else f"Dispute #{dispute_id}"
            when_text = slot.when.strftime("%d/%m/%Y %H:%M UTC") if slot.when else "see the platform"
            for p in participants:
                if not p.email:
                    continue
                # Resolve the recipient's user to (a) honor their notification
                # preference and (b) localize the time to their timezone.
                puser = None
                try:
                    if p.user_id:
                        puser = session.get(User, p.user_id)
                    if puser is None and p.email:
                        puser = session.exec(select(User).where(User.email == p.email)).first()
                except Exception:
                    puser = None
                if puser is not None and not getattr(puser, "notify_email_meetings", True):
                    continue  # recipient opted out of meeting emails
                p_when = when_text
                try:
                    from zoneinfo import ZoneInfo
                    p_tz = (getattr(puser, "timezone", None) if puser else None) or "UTC"
                    dt = slot.when
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=__import__("datetime").timezone.utc)
                    p_when = dt.astimezone(ZoneInfo(p_tz)).strftime("%d %b %Y, %H:%M ") + f"({p_tz})"
                except Exception:
                    p_when = when_text
                try:
                    send_meeting_reminder_email(
                        to_email=p.email,
                        participant_name=p.name or p.email,
                        dispute_id=dispute_id,
                        dispute_title=title,
                        when_text=p_when,
                        conference_url=conference_url,
                    )
                except Exception as e:
                    import logging
                    logging.getLogger("crea3.email").warning(
                        "Meeting reminder to %s failed (dispute %s): %s: %s",
                        p.email, dispute_id, type(e).__name__, e,
                    )
        except Exception:
            import logging
            logging.getLogger("crea3.email").warning("meeting reminder setup failed", exc_info=True)


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
    _maybe_confirm(session, slot, dispute_id, user)
    session.commit()
    session.refresh(slot)
    # Milestone-only notification: fire ONLY when a meeting time is now CONFIRMED
    # (all required parties agreed). A single party agreeing is not a milestone.
    try:
        if slot.confirmed:
            from ..services.notifications import notify_dispute
            notify_dispute(
                session, dispute_id=dispute_id, type="MeetingConfirmed",
                payload={"slot_id": slot.id}, actor_user_id=None,
            )
    except Exception:
        import logging; logging.getLogger("crea3.notify").warning("notify failed", exc_info=True)
    return _serialize(session, slot, _joined_participants(session, dispute_id), viewer=user)


@router.post("/slots/{slot_id}/decline", response_model=MediationSlotOut)
def decline_slot(dispute_id: int, slot_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Withdraw agreement from a proposed time (e.g. it no longer works)."""
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    slot = session.get(MediationSlot, slot_id)
    if not slot or slot.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Slot not found")
    agreed = set(slot.agreed_agent_ids or [])
    agreed.discard(participant.id)
    slot.agreed_agent_ids = list(agreed)
    # Declining un-confirms a previously confirmed slot.
    if slot.confirmed:
        slot.confirmed = False
    session.add(slot)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                           event_type="MediationSlotDeclined", payload={"slot_id": slot_id}))
    session.commit()
    session.refresh(slot)
    return _serialize(session, slot, _joined_participants(session, dispute_id), viewer=user)


@router.delete("/slots/{slot_id}")
def delete_slot(dispute_id: int, slot_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Remove a proposed time. Only the proposer may withdraw it."""
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    slot = session.get(MediationSlot, slot_id)
    if not slot or slot.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.proposed_by_agent_id is not None and slot.proposed_by_agent_id != participant.id:
        raise HTTPException(status_code=403, detail="Only the participant who proposed this time can remove it.")
    session.delete(slot)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                           event_type="MediationSlotRemoved", payload={"slot_id": slot_id}))
    session.commit()
    return {"ok": True}
