from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..models import VisitCounter

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.post("/visits")
def register_visit(session: Session = Depends(get_session)):
    counter = session.get(VisitCounter, 1)
    if not counter:
        counter = VisitCounter(id=1, total_visits=0)
        session.add(counter)
        session.commit()
        session.refresh(counter)

    counter.total_visits += 1
    session.add(counter)
    session.commit()
    session.refresh(counter)
    return {"total_visits": counter.total_visits}


@router.get("/visits")
def get_visits(session: Session = Depends(get_session)):
    counter = session.get(VisitCounter, 1)
    return {"total_visits": (counter.total_visits if counter else 0)}
