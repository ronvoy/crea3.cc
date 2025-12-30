from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Relationship, Column, JSON, UniqueConstraint

def utcnow():
    return datetime.now(timezone.utc)

class AccessLog(SQLModel, table=True):
    """A simple request log used by the admin 'control room'."""

    id: Optional[int] = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=utcnow, index=True)

    method: str = Field(index=True)
    path: str = Field(index=True)
    status_code: int = Field(index=True)

    ip: str = Field(default="")
    user_agent: str = Field(default="")
    user_email: Optional[str] = Field(default=None, index=True)

    duration_ms: Optional[int] = Field(default=None)
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Keycloak JWT subject (UUID-like string). Used to map Keycloak identities to local rows.
    keycloak_sub: Optional[str] = Field(default=None, index=True, unique=True)
    email: str = Field(index=True, unique=True)
    username: str = Field(index=True, unique=True)
    # When using Keycloak, we don't store passwords locally.
    # Kept for compatibility with earlier local-auth versions.
    hashed_password: str = Field(default="")
    role: str = Field(default="user", index=True)  # admin|user|agent|mediator
    email_verified: bool = Field(default=False, index=True)
    # For local/dev flows we persist the verification token so users can copy/paste it
    email_verification_token: Optional[str] = Field(default=None, index=True)
    email_verification_expires_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)

    disputes_created: List["Dispute"] = Relationship(back_populates="created_by")

class Dispute(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    method: str = Field(index=True)  # bids|rates
    status: str = Field(default="draft", index=True)  # draft|collecting|validating|proposed|accepted|finalized
    created_by_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)

    created_by: Optional[User] = Relationship(back_populates="disputes_created")
    agents: List["DisputeAgent"] = Relationship(back_populates="dispute")
    goods: List["Good"] = Relationship(back_populates="dispute")
    proposals: List["AllocationProposal"] = Relationship(back_populates="dispute")
    audit_events: List["AuditEvent"] = Relationship(back_populates="dispute")

class DisputeAgent(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("dispute_id", "email", name="uq_dispute_agent_email"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    name: str
    email: str = Field(index=True)
    entitlement_share: float = Field(default=0.0)
    role_in_dispute: Optional[str] = None
    invite_status: str = Field(default="invited", index=True)  # invited|joined
    ready: bool = Field(default=False, index=True)

    dispute: Optional[Dispute] = Relationship(back_populates="agents")
    preferences: List["Preference"] = Relationship(back_populates="agent")
    acceptances: List["Acceptance"] = Relationship(back_populates="agent")

class Good(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    name: str
    estimated_value: float = Field(default=0.0)
    indivisible: bool = Field(default=True)
    meta: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    dispute: Optional[Dispute] = Relationship(back_populates="goods")
    preferences: List["Preference"] = Relationship(back_populates="good")

class Preference(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("dispute_id", "agent_id", "good_id", name="uq_preference"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    agent_id: int = Field(foreign_key="disputeagent.id", index=True)
    good_id: int = Field(foreign_key="good.id", index=True)
    method: str  # bids|rates
    bid_amount: Optional[float] = None
    stars: Optional[int] = None
    created_at: datetime = Field(default_factory=utcnow)

    agent: Optional[DisputeAgent] = Relationship(back_populates="preferences")
    good: Optional[Good] = Relationship(back_populates="preferences")

class Strategy(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("dispute_id", "agent_id", name="uq_strategy"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    agent_id: int = Field(foreign_key="disputeagent.id", index=True)
    text: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)

class AllocationProposal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    algorithm_version: str = Field(default="v0")
    inputs_hash: str = Field(index=True)
    outputs: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    metrics: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    explanation: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)

    dispute: Optional[Dispute] = Relationship(back_populates="proposals")
    acceptances: List["Acceptance"] = Relationship(back_populates="proposal")

class Acceptance(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("proposal_id", "agent_id", name="uq_acceptance"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    proposal_id: int = Field(foreign_key="allocationproposal.id", index=True)
    agent_id: int = Field(foreign_key="disputeagent.id", index=True)
    accepted: bool = Field(default=False)
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    proposal: Optional[AllocationProposal] = Relationship(back_populates="acceptances")
    agent: Optional[DisputeAgent] = Relationship(back_populates="acceptances")

class MediationSlot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    when: datetime = Field(default_factory=utcnow)
    agreed_agent_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    confirmed: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)

class Report(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True, unique=True)
    pdf_path: str
    report_hash: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)

class AuditEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: Optional[int] = Field(default=None, foreign_key="dispute.id", index=True)
    actor_user_id: Optional[int] = Field(default=None, index=True)
    event_type: str = Field(index=True)
    payload: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)

    dispute: Optional[Dispute] = Relationship(back_populates="audit_events")



class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    dispute_id: Optional[int] = Field(default=None, foreign_key="dispute.id", index=True)
    type: str = Field(index=True)
    payload: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)


class AppMetric(SQLModel, table=True):
    __tablename__ = "app_metric"
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    value: int = Field(default=0)
    updated_at: datetime = Field(default_factory=utcnow)


class VisitCounter(SQLModel, table=True):
    id: Optional[int] = Field(default=1, primary_key=True)
    total_visits: int = 0
