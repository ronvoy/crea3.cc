from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from ..db import get_session
from ..models import Good, AuditEvent, User, DisputeAgent, Preference, EstimatorChat, ReconciliationResponse
from ..schemas import GoodAddIn
from .deps import get_current_user, can_access_dispute, get_participant
from ..core.authz import require_can_manage_structure

router = APIRouter(prefix="/api/disputes/{dispute_id}/goods", tags=["goods"])


def _require_not_locked(session: Session, dispute_id: int, user: User) -> DisputeAgent | None:
    """A party who has finished adding goods can no longer add/edit them."""
    participant = get_participant(dispute_id, user, session)
    if participant is not None and getattr(participant, "goods_locked", False):
        raise HTTPException(
            status_code=409,
            detail="You have finished adding goods. Reopen to make changes.",
        )
    return participant


@router.get("")
def list_goods(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    return goods


@router.get("/lock-status")
def goods_lock_status(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Per-party goods-lock state for the whole dispute.

    Returns each non-mediator party's name + locked flag, whether the CURRENT
    user has locked, and whether ALL parties have locked (preferences open).
    """
    can_access_dispute(dispute_id, user, session)
    agents = session.exec(
        select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)
    ).all()
    non_mediators = [a for a in agents if (a.role_in_dispute or "agent").lower() != "mediator"]
    parties = [a for a in non_mediators if a.invite_status == "joined"]
    pending = [a for a in non_mediators if (a.invite_status or "invited") == "invited"]
    me = get_participant(dispute_id, user, session)
    # Preferences open only when no party is still pending AND all joined parties locked.
    all_locked = (not pending) and bool(parties) and all(bool(a.goods_locked) for a in parties)
    return {
        "all_locked": all_locked,
        "my_locked": bool(me.goods_locked) if me else False,
        "pending_count": len(pending),
        "pending_names": [a.name for a in pending],
        "parties": [
            {"name": a.name, "locked": bool(a.goods_locked)} for a in parties
        ],
    }


@router.post("/finish")
def finish_goods(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """The calling party finishes adding goods (locks their additions)."""
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this dispute")
    if (participant.role_in_dispute or "agent").lower() == "mediator":
        raise HTTPException(status_code=400, detail="Mediators do not add goods.")
    participant.goods_locked = True
    session.add(participant)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodsFinished", payload={"agent_id": participant.id}))
    session.commit()
    # Milestone-only notification: fire ONLY when this lock means ALL parties have
    # now finished adding goods (preferences open for everyone). A single party
    # finishing is not a milestone.
    try:
        status = goods_lock_status(dispute_id, user, session)
        if status.get("all_locked"):
            from ..services.notifications import notify_dispute
            notify_dispute(session, dispute_id=dispute_id, type="GoodsPhaseComplete",
                           payload={}, actor_user_id=None)
        return status
    except Exception:
        import logging; logging.getLogger("crea3.notify").warning("notify failed", exc_info=True)
        return goods_lock_status(dispute_id, user, session)


@router.post("/reopen")
def reopen_goods(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """The calling party reopens goods editing (unlocks their additions)."""
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this dispute")
    participant.goods_locked = False
    session.add(participant)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodsReopened", payload={"agent_id": participant.id}))
    session.commit()
    return goods_lock_status(dispute_id, user, session)


class GoodValuationIn(BaseModel):
    # The party's own monetary valuation of the good. null clears it.
    value_amount: float | None = None
    # The party's own opinion on whether the good is divisible. null = unchanged.
    divisible: bool | None = None


@router.get("/my-valuations")
def my_valuations(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """The calling party's own value + divisibility opinion per good.

    Shape: { good_id: {"value_amount": number|null, "divisible": bool|null} }
    """
    can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        return {}
    prefs = session.exec(
        select(Preference).where(
            Preference.dispute_id == dispute_id,
            Preference.agent_id == participant.id,
        )
    ).all()
    val_by = {p.good_id: p.bid_amount for p in prefs if p.bid_amount is not None}
    goods = session.exec(select(Good).where(Good.dispute_id == dispute_id)).all()
    out: dict = {}
    for g in goods:
        pd = ((g.meta or {}).get("party_divisible") or {}).get(str(participant.id))
        v = val_by.get(g.id)
        if v is not None or pd is not None:
            out[str(g.id)] = {"value_amount": v, "divisible": pd}
    return out


@router.post("/{good_id}/valuation")
def set_my_valuation(
    dispute_id: int,
    good_id: int,
    payload: GoodValuationIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Record THIS party's own monetary valuation of a good.

    Separate from the good's reference value (set when it was created) and from
    star ratings. When two parties value the same good differently, the
    difference surfaces in the reconciliation step and feeds the equitable
    allocation. Editable while the dispute is still being prepared.
    """
    dispute = can_access_dispute(dispute_id, user, session)
    participant = get_participant(dispute_id, user, session)
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this dispute")
    if (participant.role_in_dispute or "agent").lower() == "mediator":
        raise HTTPException(status_code=400, detail="Mediators do not value goods.")
    if participant.invite_status != "joined":
        raise HTTPException(status_code=403, detail="You must accept the invite first.")
    if dispute.status not in ("draft", "collecting", "validating", "reconciling"):
        raise HTTPException(status_code=409, detail="Values can no longer be changed at this stage.")

    good = session.get(Good, good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")

    val = float(payload.value_amount) if payload.value_amount is not None else None
    if val is not None and val < 0:
        raise HTTPException(status_code=400, detail="Value must be >= 0.")

    # Per-party divisibility opinion is stored on the good's meta, keyed by agent.
    if payload.divisible is not None:
        meta = dict(good.meta or {})
        pd = dict(meta.get("party_divisible") or {})
        pd[str(participant.id)] = bool(payload.divisible)
        meta["party_divisible"] = pd
        good.meta = meta
        session.add(good)

    existing = session.exec(
        select(Preference).where(
            Preference.dispute_id == dispute_id,
            Preference.agent_id == participant.id,
            Preference.good_id == good_id,
        )
    ).first()
    if existing:
        existing.bid_amount = val
        if not existing.method:
            existing.method = "rates"
        session.add(existing)
    else:
        session.add(Preference(
            dispute_id=dispute_id, agent_id=participant.id, good_id=good_id,
            method="rates", stars=None, bid_amount=val,
        ))
    # ── Keep the good's REFERENCE in sync with the parties' latest opinions ──
    # value: mean of all saved party valuations (a single party's edit simply
    #        moves the reference to their latest value);
    # divisibility: indivisible is PARAMOUNT — the good stays divisible only
    #        while every party who expressed an opinion says divisible.
    # This makes the reference line reflect edits immediately and feeds the
    # up-to-date value into validation/reconciliation/proposal defaults instead
    # of freezing the creation-time entry.
    session.flush()
    all_bids = session.exec(
        select(Preference).where(
            Preference.dispute_id == dispute_id,
            Preference.good_id == good_id,
            Preference.bid_amount.is_not(None),  # type: ignore[attr-defined]
        )
    ).all()
    if all_bids:
        good.estimated_value = round(sum(float(p.bid_amount) for p in all_bids) / len(all_bids), 2)
    pd_map = (good.meta or {}).get("party_divisible") or {}
    if pd_map:
        good.divisible = all(bool(v) for v in pd_map.values())
        good.indivisible = not good.divisible
    session.add(good)

    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                           event_type="GoodValuationSet", payload={"good_id": good_id, "value": val, "divisible": payload.divisible}))
    session.commit()
    return {"ok": True, "good_id": good_id, "value_amount": val, "divisible": payload.divisible,
            "reference_value": float(good.estimated_value or 0.0), "reference_divisible": bool(good.divisible)}


@router.post("")
def add_good(dispute_id: int, payload: GoodAddIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    # Enforces access + structural-edit permission + edit-lock (status gate).
    require_can_manage_structure(session, dispute_id, user)
    _require_not_locked(session, dispute_id, user)
    meta = dict(payload.meta or {})
    meta.setdefault("currency", "EUR")
    # Record who created the good (the party who "entered it first"). This is the
    # party the reconciliation step asks to settle a value disagreement on it.
    creator = get_participant(dispute_id, user, session)
    if creator is not None and (creator.role_in_dispute or "agent").lower() != "mediator":
        meta["created_by_agent_id"] = creator.id
    good = Good(
        dispute_id=dispute_id,
        name=payload.name,
        estimated_value=payload.estimated_value,
        indivisible=not payload.divisible,
        divisible=payload.divisible,
        meta=meta,
    )
    session.add(good)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodAdded", payload={"name": payload.name}))
    session.commit()
    session.refresh(good)

    # The value entered at creation IS the creator's own valuation, so record it
    # as their preference. This means the creator is never asked again for "their
    # value", and the good is already marked as valued by them (only the other
    # parties are asked, during reconciliation, to value or accept the estimate).
    if creator is not None and (creator.role_in_dispute or "agent").lower() != "mediator":
        existing_pref = session.exec(
            select(Preference).where(
                Preference.dispute_id == dispute_id,
                Preference.agent_id == creator.id,
                Preference.good_id == good.id,
            )
        ).first()
        if existing_pref is None:
            session.add(Preference(
                dispute_id=dispute_id, agent_id=creator.id, good_id=good.id,
                method="rates", bid_amount=float(payload.estimated_value or 0.0),
            ))
            session.commit()
            session.refresh(good)
    return good


@router.patch("/{good_id}")
def update_good(dispute_id: int, good_id: int, payload: GoodAddIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    require_can_manage_structure(session, dispute_id, user)
    _require_not_locked(session, dispute_id, user)
    good = session.get(Good, good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")
    good.name = payload.name
    good.estimated_value = payload.estimated_value
    good.divisible = payload.divisible
    good.indivisible = not payload.divisible
    good.meta = dict(payload.meta or {})
    session.add(good)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodUpdated", payload={"good_id": good_id}))
    session.commit()
    session.refresh(good)
    return good


@router.delete("/{good_id}")
def delete_good(dispute_id: int, good_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    require_can_manage_structure(session, dispute_id, user)
    _require_not_locked(session, dispute_id, user)
    good = session.get(Good, good_id)
    if not good or good.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Good not found")
    # Remove every row that belongs to this good BEFORE deleting it. Without
    # this the ORM tries to NULL the children's good_id (NOT NULL -> IntegrityError,
    # i.e. deleting a rated good used to fail with a 500).
    for _pref in session.exec(select(Preference).where(Preference.good_id == good_id)).all():
        session.delete(_pref)
    for _rr in session.exec(select(ReconciliationResponse).where(ReconciliationResponse.good_id == good_id)).all():
        session.delete(_rr)
    # …including the good's AI-Estimate conversation (no orphan history).
    for _row in session.exec(select(EstimatorChat).where(EstimatorChat.good_id == good_id)).all():
        session.delete(_row)
    session.flush()
    session.delete(good)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="GoodDeleted", payload={"good_id": good_id}))
    session.commit()
    return {"ok": True}
