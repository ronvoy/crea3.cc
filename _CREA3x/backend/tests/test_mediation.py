"""End-to-end tests for the meeting scheduler (mediation slots).

Exercises the real HTTP layer via TestClient with the auth dependency stubbed.
"""
import os, sys, pathlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# conftest.py has already set DATABASE_URL to a cross-platform temp file before
# this module is imported. Start each run from a clean database if it is SQLite.
_url = os.environ.get("DATABASE_URL", "")
if _url.startswith("sqlite:///"):
    _p = pathlib.Path(_url.replace("sqlite:///", "", 1))
    try:
        _p.unlink()
    except FileNotFoundError:
        pass

import pytest
from sqlmodel import Session, SQLModel
from fastapi.testclient import TestClient

from app.db import engine
from app.models import User, Dispute, DisputeAgent
from app import main
from app.api import deps


@pytest.fixture()
def setup_dispute():
    # fresh schema
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        u = User(username="mario", email="mario@x.it"); s.add(u); s.commit(); s.refresh(u)
        d = Dispute(title="T", method="rates", status="proposed", created_by_id=u.id)
        s.add(d); s.commit(); s.refresh(d)
        s.add(DisputeAgent(dispute_id=d.id, name="Mario", email="mario@x.it", role_in_dispute="claimant", entitlement_share=0.5, invite_status="joined", user_id=u.id))
        s.add(DisputeAgent(dispute_id=d.id, name="Lucia", email="lucia@x.it", role_in_dispute="respondent", entitlement_share=0.5, invite_status="joined"))
        s.add(DisputeAgent(dispute_id=d.id, name="Verdi", email="verdi@x.it", role_in_dispute="mediator", entitlement_share=0.0, invite_status="joined"))
        s.commit()
        did = d.id
    yield did
    main.app.dependency_overrides.clear()


def _as(email, username, uid):
    main.app.dependency_overrides[deps.get_current_user] = lambda: User(id=uid, username=username, email=email)


def test_meeting_confirms_only_when_everyone_including_mediator_agrees(setup_dispute):
    did = setup_dispute
    client = TestClient(main.app)

    _as("mario@x.it", "mario", 1)
    r = client.post(f"/api/disputes/{did}/mediation/slots", json={"when": "2026-02-01T15:00:00Z"})
    assert r.status_code == 200
    slot_id = r.json()["id"]
    assert r.json()["agreed_count"] == 1 and r.json()["total_count"] == 3
    assert r.json()["confirmed"] is False

    _as("lucia@x.it", "lucia", 2)
    r = client.post(f"/api/disputes/{did}/mediation/slots/{slot_id}/agree")
    assert r.json()["agreed_count"] == 2 and r.json()["confirmed"] is False  # mediator still pending

    _as("verdi@x.it", "verdi", 3)
    r = client.post(f"/api/disputes/{did}/mediation/slots/{slot_id}/agree")
    assert r.json()["agreed_count"] == 3 and r.json()["confirmed"] is True   # now everyone agreed


def test_decline_unconfirms(setup_dispute):
    did = setup_dispute
    client = TestClient(main.app)
    _as("mario@x.it", "mario", 1)
    slot_id = client.post(f"/api/disputes/{did}/mediation/slots", json={"when": "2026-02-01T15:00:00Z"}).json()["id"]
    _as("lucia@x.it", "lucia", 2); client.post(f"/api/disputes/{did}/mediation/slots/{slot_id}/agree")
    _as("verdi@x.it", "verdi", 3); r = client.post(f"/api/disputes/{did}/mediation/slots/{slot_id}/agree")
    assert r.json()["confirmed"] is True
    _as("lucia@x.it", "lucia", 2)
    r = client.post(f"/api/disputes/{did}/mediation/slots/{slot_id}/decline")
    assert r.json()["confirmed"] is False


def test_only_proposer_can_remove(setup_dispute):
    did = setup_dispute
    client = TestClient(main.app)
    _as("mario@x.it", "mario", 1)
    slot_id = client.post(f"/api/disputes/{did}/mediation/slots", json={"when": "2026-02-01T15:00:00Z"}).json()["id"]
    _as("verdi@x.it", "verdi", 3)
    assert client.delete(f"/api/disputes/{did}/mediation/slots/{slot_id}").status_code == 403
    _as("mario@x.it", "mario", 1)
    assert client.delete(f"/api/disputes/{did}/mediation/slots/{slot_id}").status_code == 200


def test_majority_price_rule():
    from app.reconciliation import _majority_price
    vals = {1: 1000.0, 2: 2000.0}; mean = 1500.0
    # A accepts B, B keeps B -> B
    assert _majority_price(vals, mean, [2000.0, 2000.0]) == (2000.0, "majority")
    # A accepts B, B picks mean -> B
    assert _majority_price(vals, mean, [2000.0, 1500.0]) == (2000.0, "majority")
    # A keeps A, B accepts A -> A ;  A keeps A, B picks mean -> A
    assert _majority_price(vals, mean, [1000.0, 1000.0]) == (1000.0, "majority")
    assert _majority_price(vals, mean, [1000.0, 1500.0]) == (1000.0, "majority")
    # cross-accept -> mean ; both keep -> mean ; both mean -> mean
    assert _majority_price(vals, mean, [2000.0, 1000.0]) == (1500.0, "mean")
    assert _majority_price(vals, mean, [1000.0, 2000.0]) == (1500.0, "mean")
    assert _majority_price(vals, mean, [1500.0, 1500.0]) == (1500.0, "mean")
