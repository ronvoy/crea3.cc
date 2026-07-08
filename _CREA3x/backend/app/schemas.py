from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# NOTE:
# This project uses Pydantic v2.
# All response models set `from_attributes=True` so they can be returned
# directly from SQLModel/SQLAlchemy objects.


class _ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# -----------------
# Authentication
# -----------------


class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=256)


class RegisterOut(BaseModel):
    # When SMTP is enabled, we still return the token for manual copy/paste
    # (useful in local/dev environments).
    verification_token: str


class VerifyEmailIn(BaseModel):
    token: str = Field(min_length=10)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshIn(BaseModel):
    refresh_token: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=256)


class UserOut(_ORMModel):
    id: int
    email: str
    username: str
    role: str
    # Keycloak claim
    email_verified: bool = False
    # Backwards-compat field (older frontend zips used this name)
    is_verified: bool | None = None
    # Provenance-driven settings
    country: Optional[str] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None
    # Notification preferences
    notify_email_invitations: bool = True
    notify_email_meetings: bool = True
    notify_email_milestones: bool = True

    def model_post_init(self, __context) -> None:
        if self.is_verified is None:
            self.is_verified = bool(self.email_verified)


# -----------------
# Disputes

# -----------------


class DisputeCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # keep as string to avoid Pydantic schema issues; validation happens in app logic
    method: str = Field(min_length=1, max_length=40)


class DisputeOut(_ORMModel):
    id: int
    title: str
    method: str
    status: str
    created_by_id: Optional[int] = None


# -----------------
# Agents
# -----------------


class AgentAddIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    # Entitlement share 1%..99% (0.01..0.99). The sum across parties should not
    # exceed 100%; this is validated when the proposal is built (and normalized
    # if the parties' own claims conflict).
    entitlement_share: float = Field(ge=0.0, le=0.99)
    role_in_dispute: Optional[str] = Field(default=None, max_length=120)


class AgentOut(_ORMModel):
    id: int
    name: str
    email: str
    entitlement_share: float
    claimed_entitlement_share: Optional[float] = None
    role_in_dispute: Optional[str] = None


class ClaimedShareIn(BaseModel):
    # A party's own claimed entitlement share, 1%..99%.
    claimed_entitlement_share: float = Field(ge=0.01, le=0.99)
    # Optional short justification for the claim (<=50 chars).
    position: Optional[str] = Field(default=None, max_length=50)


# -----------------
# Goods
# -----------------


class GoodAddIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    estimated_value: float = Field(ge=0.0)
    indivisible: bool = False
    divisible: bool = False
    meta: Dict[str, Any] = Field(default_factory=dict)


class GoodOut(_ORMModel):
    id: int
    dispute_id: int
    name: str
    estimated_value: float
    indivisible: bool
    divisible: bool = False
    meta: Dict[str, Any] = Field(default_factory=dict)


# -----------------
# Preferences
# -----------------


class PreferenceUpsertIn(BaseModel):
    good_id: int
    bid_amount: Optional[float] = Field(default=None, ge=0.0)
    stars: Optional[int] = Field(default=None, ge=0, le=5)
    # The party's OWN monetary valuation of this good (optional). Stored in the
    # Preference.bid_amount column and used by the equitable allocation engine.
    value_amount: Optional[float] = Field(default=None, ge=0.0)


class PreferenceOut(_ORMModel):
    good_id: int
    bid_amount: Optional[float] = None
    stars: Optional[int] = None


# -----------------
# Proposals
# -----------------


class ProposalOut(_ORMModel):
    id: int
    dispute_id: int
    algorithm_version: str
    outputs: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    explanation: Optional[str] = None
    created_at: datetime


class AcceptIn(BaseModel):
    accepted: bool
    comment: Optional[str] = Field(default=None, max_length=1000)


class ProfileUpdateIn(BaseModel):
    # Provenance: country drives timezone + default language. Language can be
    # overridden independently. All optional so partial updates are allowed.
    country: Optional[str] = Field(default=None, max_length=4)
    locale: Optional[str] = Field(default=None, max_length=8)
    timezone: Optional[str] = Field(default=None, max_length=64)
    # Notification preferences
    notify_email_invitations: Optional[bool] = None
    notify_email_meetings: Optional[bool] = None
    notify_email_milestones: Optional[bool] = None


# -----------------
# Strategy
# -----------------


class StrategyUpsertIn(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class StrategyOut(_ORMModel):
    dispute_id: int
    text: str


# -----------------
# Ready
# -----------------


class ReadyIn(BaseModel):
    ready: bool


# -----------------
# Mediation
# -----------------


class MediationSlotCreateIn(BaseModel):
    when: str = Field(min_length=1, max_length=120)


class MediationParticipantState(BaseModel):
    agent_id: int
    name: str
    role: str
    agreed: bool
    # Provenance, so the UI can show each party's timezone when scheduling.
    timezone: Optional[str] = None
    country: Optional[str] = None


class MediationSlotOut(_ORMModel):
    id: int
    when: str
    # Meeting time formatted in the REQUESTING user's local timezone (provenance),
    # plus the IANA tz name used, so each party sees the time in their own zone.
    when_local: Optional[str] = None
    tz: Optional[str] = None
    agreed_agent_ids: List[int] = Field(default_factory=list)
    confirmed: bool
    proposed_by_agent_id: Optional[int] = None
    proposed_by_name: Optional[str] = None
    # Full per-participant agreement state (parties + mediators), by name.
    participants: List[MediationParticipantState] = Field(default_factory=list)
    agreed_count: int = 0
    total_count: int = 0


# -----------------
# Notifications
# -----------------


class NotificationInviteOut(_ORMModel):
    id: int
    dispute_id: int
    email: EmailStr
    token: str
    accepted: bool
    created_at: datetime


class InvitationOut(_ORMModel):
    agent_id: int
    dispute_id: int
    dispute_title: str
    invited_as: str
    invite_status: str
    entitlement_share: float
    invited_at: datetime
    invited_by_email: Optional[str] = None
    invited_by_username: Optional[str] = None


class InvitationRespondIn(BaseModel):
    accept: bool
    comment: Optional[str] = Field(default=None, max_length=2000)
